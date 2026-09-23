/**
 * Ícono generado dinámicamente por negocio — no depende de que hayan
 * subido un logo. Muestra la inicial del nombre sobre su color de marca,
 * consistente con lo que ya ve en el encabezado de su tienda.
 */
export function buildIconElement(name: string, brandPrimary: string, size: number) {
  const initial = (name.trim()[0] ?? "S").toUpperCase();
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: brandPrimary,
        fontFamily: "sans-serif",
      }}
    >
      <span
        style={{
          color: "white",
          fontSize: size * 0.55,
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        {initial}
      </span>
    </div>
  );
}
