/**
 * Foto de perfil → data URL cuadrada de 160px.
 *
 * Vivía dentro de HomeProfileScreen; se saca aquí porque ahora la usan dos
 * sitios (el perfil del hogar y el perfil social) y dos copias del mismo
 * recorte acabarían dando avatares de tamaños distintos.
 *
 * 160px y JPEG al 82% deja la imagen en ~8-12 KB. Importa porque el avatar
 * social viaja en `social_profiles.avatar_url` y esa fila se lee una vez por
 * autor en cada tanda del feed: un original de 3 MB haría el feed inusable.
 */
export function fileToAvatarDataUrl(file, size = 160) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        // Recorte centrado: se escala por el lado corto y se centra, para que
        // una foto apaisada no salga con bandas.
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
