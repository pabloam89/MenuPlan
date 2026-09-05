// Wrapper compartido por todos los beats del vídeo isométrico: mismo perspective
// y mismo rotateX/rotateZ para que cada escena viva en el mismo "mundo" 3D.
// Ver guión: rotateX(58deg) rotateZ(-45deg) es la aproximación CSS habitual
// del ángulo isométrico real (35.264deg).
export function IsoWorld({ children, rotateX = 58, rotateZ = -45, perspective = 1500, style }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        perspective,
        ...style,
      }}
    >
      <div
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${rotateX}deg) rotateZ(${rotateZ}deg)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
