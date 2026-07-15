use crate::error::AgentError;

pub fn confirm(document_name: &str, document_sha256: &str) -> Result<(), AgentError> {
    #[cfg(target_os = "linux")]
    {
        return linux_confirmation(document_name, document_sha256);
    }
    #[cfg(target_os = "windows")]
    {
        return windows_confirmation(document_name, document_sha256);
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    let _ = (document_name, document_sha256);
    #[allow(unreachable_code)]
    Err(AgentError::UnsupportedPlatform)
}

#[cfg(target_os = "linux")]
fn linux_confirmation(document_name: &str, document_sha256: &str) -> Result<(), AgentError> {
    use std::process::{Command, Stdio};

    let message = format!(
        "Documento: {document_name}\nSHA-256: {document_sha256}\n\nConfira o documento no portal antes de autorizar o token."
    );
    let candidates: [(&str, &[&str]); 2] = [
        (
            "zenity",
            &[
                "--question",
                "--title=Assinar com ICP-Brasil",
                "--ok-label=Assinar",
                "--cancel-label=Cancelar",
            ],
        ),
        ("kdialog", &["--title", "Assinar com ICP-Brasil", "--yesno"]),
    ];

    for (program, arguments) in candidates {
        let mut command = Command::new(program);
        command
            .args(arguments)
            .arg(&message)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        match command.status() {
            Ok(status) if status.success() => return Ok(()),
            Ok(_) => return Err(AgentError::UserCancelled),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(_) => return Err(AgentError::ConfirmationUnavailable),
        }
    }
    Err(AgentError::ConfirmationUnavailable)
}

#[cfg(target_os = "windows")]
fn windows_confirmation(document_name: &str, document_sha256: &str) -> Result<(), AgentError> {
    use windows::{
        Win32::UI::WindowsAndMessaging::{
            IDOK, MB_DEFBUTTON2, MB_ICONWARNING, MB_OKCANCEL, MessageBoxW,
        },
        core::HSTRING,
    };

    let title = HSTRING::from("Assinar documento com certificado ICP-Brasil?");
    let message = HSTRING::from(format!(
        "Documento: {document_name}\r\nSHA-256: {document_sha256}\r\n\r\nConfira o documento no portal antes de autorizar o token."
    ));
    let result = unsafe {
        MessageBoxW(
            None,
            &message,
            &title,
            MB_OKCANCEL | MB_ICONWARNING | MB_DEFBUTTON2,
        )
    };
    if result == IDOK {
        Ok(())
    } else {
        Err(AgentError::UserCancelled)
    }
}
