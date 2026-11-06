# Correos del día por Power Automate (con aprobación)

Al publicar Estructura, Bajas o Aprovechamiento, el panel admin arma el correo
(lámina + Excel) y lo deja como un `.json` en una carpeta de OneDrive. Un flujo
de Power Automate ve el archivo, te pide aprobación y, al aprobar, lo envía
desde angel.franco@oxxo.com.

## 1. Una sola vez en la PC

1. En el Explorador, dentro de **OneDrive - FEMSA Proximidad & Salud**, crea la
   carpeta **Conoxxo Correos**.
2. Brave trae apagada la función para guardar en carpetas. Abre
   `brave://flags/#file-system-access-api`, ponla en **Enabled** y da
   **Relaunch**. (En Edge o Chrome no hace falta.)
3. En el panel admin, en **Correos del día → Envío automático con aprobación**,
   da **Elegir carpeta de OneDrive**, elige **Conoxxo Correos** y permite
   "ver y editar". Si el navegador ofrece *Permitir en cada visita*, elígelo.
4. Marca **Mandar a aprobación al publicar**.

En cada sesión nueva puede aparecer el botón **Activar**: da clic antes de
publicar para renovar el permiso de la carpeta.

## 2. El flujo (make.powerautomate.com)

**Crear → Flujo de nube automatizado**, nombre `Conoxxo · Correos del día`.

### Desencadenador: *Cuando se crea un archivo* (OneDrive para la Empresa)

- **Carpeta**: `/Conoxxo Correos`
- Parámetros avanzados → **Inferir tipo de contenido**: `No`
- Sin condiciones del desencadenador: en las revisiones sin archivo nuevo el
  nombre llega vacío y una condición como `endsWith(...)` truena el flujo
  (InvalidTemplate). En la carpeta solo deja archivos el panel.

### Acción: *Analizar JSON* (Operación de datos)

- **Contenido** (pestaña Expresión, fx):

  ```
  json(base64ToString(triggerBody()?['$content']))
  ```

- **Esquema**:

  ```json
  {
    "type": "object",
    "properties": {
      "formato": { "type": "string" },
      "correo": { "type": "string" },
      "para": { "type": "string" },
      "cc": { "type": "string" },
      "asunto": { "type": "string" },
      "html": { "type": "string" },
      "resumen": { "type": "string" },
      "adjuntos": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "Name": { "type": "string" },
            "ContentBytes": { "type": "string" }
          }
        }
      }
    }
  }
  ```

### Acción: *Iniciar y esperar una aprobación* (Aprobaciones)

- **Tipo**: Aprobar/rechazar: primero en responder
- **Título**: contenido dinámico `asunto`
- **Asignado a**: `angel.franco@oxxo.com`
- **Detalles**: `resumen`, y en otra línea `Para: para · CC: cc`

### Acción: *Condición*

- `Resultado` (de la aprobación) **es igual a** `Approve`

### En "True": *Enviar un correo electrónico (V2)* (Office 365 Outlook)

- **Para**: `para`
- **Asunto**: `asunto`
- **Cuerpo**: cambia a vista de código (`</>`) y pon solo el contenido
  dinámico `html`
- Parámetros avanzados:
  - **CC**: `cc`
  - **Datos adjuntos**: cambia a "entrada de matriz completa" (icono `T`/`[ ]`)
    y pon la expresión:

    ```
    body('Analizar_JSON')?['adjuntos']
    ```

Las imágenes van por `cid:` con el nombre del adjunto (`captura1.png`,
`firma.png`), así que Outlook las muestra dentro del correo.

### Opcional: limpiar la carpeta

Al final del flujo (fuera de la condición), *Eliminar archivo* (OneDrive para
la Empresa) con **Archivo**:

```
triggerOutputs()?['headers']?['x-ms-file-id']
```

## Primera prueba

Antes de usarlo con el equipo, cambia en la acción de envío **Para** y **CC**
por `angel.franco@oxxo.com`, publica o usa **Mandar a aprobación** en una fila,
aprueba y revisa el correo. Si todo se ve bien, regresa **Para** y **CC** a los
campos dinámicos.

## Si algo falla

- *El panel dice "falta dar permiso"*: da clic en **Activar** (arriba de la
  lista) y vuelve a usar **Mandar a aprobación**.
- *El flujo no arranca*: revisa que el archivo `.json` llegó a
  `OneDrive/Conoxxo Correos` y que OneDrive terminó de sincronizar.
- *Falla "Analizar JSON"*: en el historial del flujo abre la ejecución y
  manda captura del error.
- El botón **Preparar correo** (archivo `.eml` para Outlook) sigue
  funcionando igual como respaldo.
