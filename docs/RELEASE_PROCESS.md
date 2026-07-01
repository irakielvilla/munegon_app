# Proceso de Lanzamiento de Nueva Versión (Release) en GitHub

Este documento describe el proceso paso a paso para publicar una nueva versión de la aplicación Muñegon POS en GitHub Releases, asegurando que los usuarios finales vean la versión correcta y que el código publicado provenga siempre de la rama principal (`main`).

## 1. Preparar la rama `main`

Las versiones oficiales siempre deben lanzarse desde el último commit de la rama `main`.

1. Cambia a la rama `main`:
   ```bash
   git checkout main
   ```
2. Asegúrate de tener los últimos cambios de la nube:
   ```bash
   git pull origin main
   ```
3. Si desarrollaste en `develop` u otra rama, asegúrate de haber hecho un merge hacia `main` primero.

## 2. Actualizar la versión de la Aplicación

Debes incrementar el número de versión (ej. de `1.1.8` a `1.1.9` o `1.2.0`) en los siguientes archivos clave:

### Archivos de Configuración
- **`package.json`**: Modifica el campo `"version"`.
- **`src-tauri/tauri.conf.json`**: Modifica el campo `"version"` dentro de este archivo para que coincida.

### Interfaz de Usuario (Frontend)
- **`src/components/LoginScreen.astro`**: 
  - Busca el texto donde se muestra la versión actual de la aplicación (por ejemplo en el pie de página o bajo el título de la pantalla de Login).
  - Actualízalo manualmente para que coincida con la nueva versión.
  - *Nota: Es fundamental hacer este cambio en el LoginScreen para que el usuario pueda verificar visualmente qué versión de la app está ejecutando al momento de iniciar sesión.*

## 3. Hacer Commit y Push de los cambios de versión

Una vez modificados todos los archivos con el nuevo número de versión, consolida y sube los cambios:

```bash
git add package.json src-tauri/tauri.conf.json src/components/LoginScreen.astro
git commit -m "chore: bump version to vX.Y.Z"
git push origin main
```
*(Reemplaza `X.Y.Z` con el número exacto de la nueva versión)*

## 4. Crear la Etiqueta (Tag) de Git

Para que GitHub reconozca que este punto en la historia es una versión estable, debes crear un "Tag" en el último commit de `main`.

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

## 5. Publicar en GitHub Releases

1. Ve al repositorio en GitHub (sección "Releases").
2. Haz clic en **Draft a new release**.
3. En **Choose a tag**, selecciona el tag `vX.Y.Z` que acabas de subir.
4. Confirma que el "Target" esté apuntando a la rama `main`.
5. Coloca como título el número de versión (ej. `v1.2.0`).
6. En la descripción (release notes), añade los cambios más importantes o usa el botón "Generate release notes" de GitHub.
7. Haz clic en **Publish release**.

> **Automatización (Tauri GitHub Actions):**
> Al publicar el release con el nuevo tag, si tienes configurado el flujo de GitHub Actions para Tauri, éste tomará el código de ese tag en la rama `main`, compilará los ejecutables de la aplicación (`.exe`, instaladores, etc.) y los adjuntará automáticamente al release que acabas de publicar.
