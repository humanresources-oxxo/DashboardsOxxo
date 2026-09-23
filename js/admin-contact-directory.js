/* Directorio privado para la descarga de contactos de bajas.
   Solo conserva número de personal y teléfono; el Excel fuente no se publica. */
(function(){
  const fileInput = document.getElementById('contact-directory-file');
  const publishButton = document.getElementById('contact-directory-publish');
  const status = document.getElementById('contact-directory-status');
  if (!fileInput || !publishButton || !status) return;

  let contacts = [];
  const key = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
  const personalAliases = ['No. Personal', 'Numero Personal', 'N° Personal', 'Nº Personal', 'No empleado', 'Numero empleado'].map(key);
  const phoneAliases = ['Telefono', 'Teléfono', 'Celular', 'Numero telefonico', 'Número telefónico'].map(key);
  const findColumn = (headers, aliases) => headers.findIndex(header => aliases.includes(key(header)));

  function readContacts(matrix){
    const headerRow = matrix.findIndex((row, index) => index < 12 && findColumn(row, personalAliases) !== -1 && findColumn(row, phoneAliases) !== -1);
    if (headerRow === -1) throw new Error('No encontré las columnas “N° personal” y “Teléfono”.');
    const headers = matrix[headerRow];
    const personalColumn = findColumn(headers, personalAliases);
    const phoneColumn = findColumn(headers, phoneAliases);
    const unique = new Map();
    matrix.slice(headerRow + 1).forEach(row => {
      const personal = String(row[personalColumn] ?? '').trim();
      const telefono = String(row[phoneColumn] ?? '').trim();
      if (personal && telefono) unique.set(personal, telefono);
    });
    return Array.from(unique, ([personal, telefono]) => ({ personal, telefono }));
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    contacts = [];
    publishButton.disabled = true;
    if (!file) { status.textContent = 'Selecciona una plantilla operativa con N° personal y Teléfono.'; return; }
    status.textContent = 'Leyendo únicamente N° personal y Teléfono…';
    try {
      await window.OXXO_ADMIN_ASSETS.ensure('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false, codepage: 65001 });
      for (const sheetName of workbook.SheetNames) {
        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
        try {
          contacts = readContacts(matrix);
          if (contacts.length) break;
        } catch (_) { /* se intenta la siguiente hoja */ }
      }
      if (!contacts.length) throw new Error('No encontré filas válidas con número de personal y teléfono.');
      status.textContent = `${contacts.length.toLocaleString('es-MX')} contactos listos. No se conservarán otras columnas del archivo.`;
      publishButton.disabled = false;
    } catch (error) {
      status.textContent = error.message || 'No se pudo leer el archivo.';
    }
  });

  publishButton.addEventListener('click', async () => {
    if (!contacts.length) return;
    const context = window.OXXO_ADMIN_CTX;
    if (!context || !context.getAdminPassword || !context.postAdminPayload) {
      status.textContent = 'Inicia sesión en el panel admin antes de actualizar el directorio.';
      return;
    }
    publishButton.disabled = true;
    const original = publishButton.textContent;
    publishButton.textContent = 'Actualizando…';
    try {
      const result = await context.postAdminPayload({
        action: 'replaceContactDirectory',
        adminPassword: context.getAdminPassword(),
        contacts: contacts
      });
      status.textContent = `${Number(result.contacts || contacts.length).toLocaleString('es-MX')} contactos actualizados en el directorio privado.`;
      contacts = [];
      fileInput.value = '';
    } catch (error) {
      status.textContent = `No se actualizó el directorio: ${error.message || error}`;
    } finally {
      publishButton.textContent = original;
      publishButton.disabled = !contacts.length;
    }
  });
})();
