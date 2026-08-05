use http::{Response, StatusCode};
use http_body_util::Full;
use hyper::body::Bytes;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, body::Incoming};
use hyper_util::rt::TokioIo;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::path::{Component, Path, PathBuf};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinHandle;

const CONTENT_SECURITY_POLICY: &str = include_str!("../../config/csp-prod.txt");

pub struct StaticServerHandle {
  _task: JoinHandle<()>,
}

fn sanitize_request_path(root: &Path, request_path: &str) -> Result<PathBuf, ()> {
  let trimmed = request_path.split('?').next().unwrap_or("/");
  let relative = trimmed.trim_start_matches('/');
  let mut path = PathBuf::from(root);
  if relative.is_empty() {
    path.push("index.html");
    return Ok(path);
  }
  for component in Path::new(relative).components() {
    match component {
      Component::Normal(value) => path.push(value),
      Component::CurDir => {},
      Component::ParentDir | Component::RootDir | Component::Prefix(_) => return Err(()),
    }
  }
  Ok(path)
}

fn is_path_within(root: &Path, target: &Path) -> bool {
  target == root || target.starts_with(root)
}

fn path_contains_symlink(root: &Path, target: &Path) -> bool {
  let Ok(relative) = target.strip_prefix(root) else { return true; };
  let mut current = PathBuf::from(root);
  for component in relative.components() {
    current.push(component);
    if std::fs::symlink_metadata(&current).map(|meta| meta.file_type().is_symlink()).unwrap_or(true) {
      return true;
    }
  }
  false
}

fn response_with_status(status: StatusCode, text: &str) -> Response<Full<Bytes>> {
  Response::builder()
    .status(status)
    .body(Full::new(Bytes::from(text.to_string())))
    .unwrap()
}

async fn serve_file(root: PathBuf, request: Request<Incoming>) -> Result<Response<Full<Bytes>>, Infallible> {
  if request.method() != Method::GET && request.method() != Method::HEAD {
    return Ok(response_with_status(StatusCode::METHOD_NOT_ALLOWED, "Method Not Allowed"));
  }
  let Ok(mut path) = sanitize_request_path(&root, request.uri().path()) else {
    return Ok(response_with_status(StatusCode::FORBIDDEN, "Forbidden"));
  };
  if tokio::fs::metadata(&path).await.map(|meta| meta.is_dir()).unwrap_or(false) {
    path.push("index.html");
  }
  let Ok(canonical) = std::fs::canonicalize(&path) else {
    return Ok(response_with_status(StatusCode::NOT_FOUND, "Not Found"));
  };
  if !is_path_within(&root, &canonical) || path_contains_symlink(&root, &path) {
    return Ok(response_with_status(StatusCode::FORBIDDEN, "Forbidden"));
  }
  match tokio::fs::read(&canonical).await {
    Ok(bytes) => {
      let mime = mime_guess::from_path(&canonical).first_or_octet_stream();
      let response = Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", mime.as_ref())
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        // include_str! keeps the source file's trailing newline, which is invalid in an HTTP header.
        .header("Content-Security-Policy", CONTENT_SECURITY_POLICY.trim())
        .header("X-Content-Type-Options", "nosniff")
        .body(if request.method() == Method::HEAD { Full::new(Bytes::new()) } else { Full::new(Bytes::from(bytes)) })
        .unwrap();
      Ok(response)
    }
    Err(_) => Ok(response_with_status(StatusCode::NOT_FOUND, "Not Found")),
  }
}

async fn wait_until_server_ready(address: SocketAddr) -> Result<(), String> {
  for _ in 0..40 {
    if TcpStream::connect(address).await.is_ok() {
      return Ok(());
    }
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
  }
  Err("Timed out waiting for static server".to_string())
}

pub async fn spawn_static_server(root_dir: PathBuf, host: &str, port: u16) -> Result<StaticServerHandle, String> {
  if std::fs::symlink_metadata(&root_dir).map_err(|error| error.to_string())?.file_type().is_symlink() {
    return Err("Static asset root must not be a symbolic link".to_string());
  }
  let root_dir = std::fs::canonicalize(root_dir).map_err(|error| error.to_string())?;
  if !root_dir.is_dir() {
    return Err("Static asset root is not a directory".to_string());
  }
  let address: SocketAddr = format!("{}:{}", host, port)
    .parse::<SocketAddr>()
    .map_err(|error| error.to_string())?;
  let listener = TcpListener::bind(address).await.map_err(|error| error.to_string())?;
  let task = tokio::spawn(async move {
    loop {
      let accepted = listener.accept().await;
      let (stream, _) = match accepted {
        Ok(value) => value,
        Err(error) => {
          eprintln!("[tauri static server accept failed] {}", error);
          break;
        }
      };
      let io = TokioIo::new(stream);
      let root = root_dir.clone();
      tokio::spawn(async move {
        let service = service_fn(move |request| serve_file(root.clone(), request));
        if let Err(error) = http1::Builder::new().serve_connection(io, service).await {
          eprintln!("[tauri static server connection failed] {}", error);
        }
      });
    }
  });
  wait_until_server_ready(address).await?;
  Ok(StaticServerHandle { _task: task })
}
