---
name: updategithub
description: Automatiza el proceso de subir y publicar una nueva versión en GitHub, actualizando archivos y creando el tag.
---
# updategithub

Esta skill automatiza el proceso detallado en `docs/RELEASE_PROCESS.md` para publicar una nueva versión de Muñegon POS en GitHub. 

## Instrucciones de Ejecución

Cuando el usuario pida lanzar una nueva versión (o invoque esta skill explícitamente), debes actuar como un agente autónomo y seguir rigurosamente estos pasos:

1. **Obtener la nueva versión**: Pregunta al usuario cuál es el número de la nueva versión (ej. `1.2.0`) si no te lo ha proporcionado. (Asume formato SemVer sin la "v" para los archivos internos).
2. **Checkout a `main`**: Ejecuta `git checkout main` y actualiza con `git pull origin main`. Si hay cambios pendientes de código en el repositorio, advierte al usuario antes de proceder.
3. **Actualizar la versión en los archivos clave**: Usa tus herramientas de búsqueda y reemplazo de archivos (`multi_replace_file_content` o similares) para actualizar:
   - El campo `"version"` en `package.json`.
   - El campo `"version"` en `src-tauri/tauri.conf.json`.
   - La cadena de texto de versión (ej. `v1.x.x`) en `src/components/LoginScreen.astro` para que los usuarios la vean en el frontend.
4. **Hacer Commit y Push**:
   - `git add package.json src-tauri/tauri.conf.json src/components/LoginScreen.astro`
   - `git commit -m "chore: bump version to vX.Y.Z"` (reemplazando X.Y.Z con el valor real)
   - `git push origin main`
5. **Crear y Subir el Tag**:
   - Crea un tag de la versión: `git tag vX.Y.Z`
   - Sube el tag: `git push origin vX.Y.Z`
6. **Finalizar y Notificar**:
   - Informa al usuario que todos los cambios en el código y el tag han sido subidos con éxito a GitHub.
   - Pídele que se dirija a la pestaña "Releases" de su repositorio en GitHub, presione "Draft a new release", seleccione el tag que acabas de subir y publique la versión para disparar los procesos de CI/CD (Tauri GitHub Actions).
