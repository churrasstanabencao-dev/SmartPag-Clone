export const IMAGE_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp";

/**
 * Lê um arquivo de imagem (JPG, PNG ou WEBP), redimensiona para no máximo
 * `max` pixels no maior lado e devolve um data URL leve para salvar no banco.
 */
export async function fileToResizedDataUrl(file: File, max = 800): Promise<string> {
  if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) {
    throw new Error("Formato inválido. Use JPG, PNG ou WEBP.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Imagem muito grande (máx. 8MB).");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Imagem inválida."));
    el.src = dataUrl;
  });

  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}
