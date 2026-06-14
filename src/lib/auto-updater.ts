import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export async function iniciarChequeoActualizaciones() {
  try {
    // Si no estamos corriendo dentro de Tauri, el import de check o la ejecución fallará silenciosamente
    if (!(window as any).__TAURI_INTERNALS__) {
      console.log('[Updater] No se detectó el entorno de Tauri. Omitiendo chequeo de actualizaciones.');
      return;
    }

    const update = await check();
    if (!update) {
      console.log('[Updater] La aplicación ya está en su versión más reciente.');
      return;
    }

    console.log(`[Updater] Nueva versión disponible: v${update.version}`);
    mostrarModalActualizacion(update);
  } catch (err) {
    console.error('[Updater] Error al verificar actualizaciones:', err);
  }
}

function mostrarModalActualizacion(update: any) {
  // Evitar duplicados
  if (document.getElementById('tauri-updater-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'tauri-updater-modal';
  
  // Diseño Glassmorphic Premium Dark Mode
  Object.assign(modal.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    backdropFilter: 'blur(12px)',
    webKitBackdropFilter: 'blur(12px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: '99999',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#f8fafc',
    transition: 'opacity 0.3s ease',
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    width: '420px',
    padding: '32px',
    borderRadius: '20px',
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(56, 189, 248, 0.05)',
    textAlign: 'center',
    transform: 'scale(0.95)',
    transition: 'transform 0.3s ease',
  });

  card.innerHTML = `
    <div style="width: 56px; height: 56px; background: rgba(56, 189, 248, 0.1); border-radius: 9999px; display: flex; justify-content: center; align-items: center; margin: 0 auto 20px auto; border: 1px solid rgba(56, 189, 248, 0.2);">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    </div>
    <h3 style="margin: 0 0 10px 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.025em;">Actualización disponible</h3>
    <p style="font-size: 14px; color: #94a3b8; line-height: 1.5; margin: 0 0 24px 0;">La versión <span style="color: #38bdf8; font-weight: 600;">v${update.version}</span> de Muñegon POS está lista para ser descargada e instalada de forma segura.</p>
    
    <div id="updater-progress-container" style="display: none; margin-bottom: 24px;">
      <div style="background-color: rgba(51, 65, 85, 0.5); border-radius: 9999px; height: 10px; overflow: hidden; width: 100%; border: 1px solid rgba(255,255,255,0.05);">
        <div id="updater-progress-bar" style="background: linear-gradient(90deg, #0ea5e9, #2563eb); height: 100%; width: 0%; transition: width 0.1s linear; border-radius: 9999px;"></div>
      </div>
      <p id="updater-status" style="font-size: 13px; color: #cbd5e1; margin: 10px 0 0 0; font-weight: 500;">Descargando: 0%</p>
    </div>

    <div id="updater-actions" style="display: flex; gap: 16px; justify-content: center;">
      <button id="btn-update-cancel" style="background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; padding: 12px 24px; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s; width: 50%;">Más tarde</button>
      <button id="btn-update-confirm" style="background: linear-gradient(135deg, #0ea5e9, #2563eb); border: none; color: #ffffff; padding: 12px 24px; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600; box-shadow: 0 10px 15px -3px rgba(14, 165, 233, 0.3); transition: all 0.2s; width: 50%;">Actualizar ahora</button>
    </div>
  `;

  modal.appendChild(card);
  document.body.appendChild(modal);

  // Animación de entrada
  void modal.offsetWidth;
  card.style.transform = 'scale(1)';

  const btnCancel = card.querySelector('#btn-update-cancel') as HTMLButtonElement;
  const btnConfirm = card.querySelector('#btn-update-confirm') as HTMLButtonElement;
  const actionsDiv = card.querySelector('#updater-actions') as HTMLDivElement;
  const progressContainer = card.querySelector('#updater-progress-container') as HTMLDivElement;
  const progressBar = card.querySelector('#updater-progress-bar') as HTMLDivElement;
  const statusText = card.querySelector('#updater-status') as HTMLParagraphElement;

  // Efectos hover
  btnCancel.onmouseover = () => {
    btnCancel.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    btnCancel.style.color = '#ffffff';
  };
  btnCancel.onmouseout = () => {
    btnCancel.style.backgroundColor = 'transparent';
    btnCancel.style.color = '#94a3b8';
  };

  btnConfirm.onmouseover = () => {
    btnConfirm.style.transform = 'translateY(-1px)';
    btnConfirm.style.boxShadow = '0 12px 20px -3px rgba(14, 165, 233, 0.4)';
  };
  btnConfirm.onmouseout = () => {
    btnConfirm.style.transform = 'translateY(0)';
    btnConfirm.style.boxShadow = '0 10px 15px -3px rgba(14, 165, 233, 0.3)';
  };

  btnCancel.addEventListener('click', () => {
    modal.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    setTimeout(() => {
      if (document.body.contains(modal)) {
        document.body.removeChild(modal);
      }
    }, 300);
  });

  btnConfirm.addEventListener('click', async () => {
    // Ocultar acciones, mostrar contenedor de progreso
    actionsDiv.style.opacity = '0';
    setTimeout(() => {
      actionsDiv.style.display = 'none';
      progressContainer.style.display = 'block';
      void progressContainer.offsetWidth;
      progressContainer.style.opacity = '1';
    }, 200);

    try {
      let downloadedBytes = 0;
      let totalBytes = 0;

      await update.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            totalBytes = event.data.contentLength || 0;
            statusText.innerText = 'Iniciando descarga de actualización...';
            break;
          case 'Progress':
            downloadedBytes += event.data.chunkLength;
            if (totalBytes > 0) {
              const pct = Math.round((downloadedBytes / totalBytes) * 100);
              progressBar.style.width = `${pct}%`;
              statusText.innerText = `Descargando: ${pct}%`;
            } else {
              statusText.innerText = `Descargando: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`;
            }
            break;
          case 'Finished':
            progressBar.style.width = '100%';
            statusText.innerText = 'Instalación completada. Reiniciando...';
            break;
        }
      });

      // Relaunch después de una breve pausa para que se aprecie la finalización
      setTimeout(async () => {
        await relaunch();
      }, 1500);

    } catch (error: any) {
      console.error('[Updater] Error durante la descarga o instalación:', error);
      statusText.innerText = 'Error al instalar la actualización.';
      statusText.style.color = '#ef4444';
      
      // Mostrar botón de cierre para salir del estado de error
      setTimeout(() => {
        alert('Hubo un error al actualizar: ' + error.message);
        if (document.body.contains(modal)) {
          document.body.removeChild(modal);
        }
      }, 1000);
    }
  });
}
