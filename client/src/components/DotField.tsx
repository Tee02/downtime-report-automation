import { memo, useEffect, useRef } from "react";

const TWO_PI = Math.PI * 2;

type Dot = { ax: number; ay: number; sx: number; sy: number };

type DotFieldProps = {
  dotRadius?: number;
  dotSpacing?: number;
  cursorRadius?: number;
  bulgeStrength?: number;
  glowRadius?: number;
  gradientFrom?: string;
  gradientTo?: string;
  glowColor?: string;
  className?: string;
};

const DotField = memo(({
  dotRadius = 1.15,
  dotSpacing = 18,
  cursorRadius = 440,
  bulgeStrength = 42,
  glowRadius = 180,
  gradientFrom = "rgba(61, 82, 160, 0.30)",
  gradientTo = "rgba(112, 145, 230, 0.28)",
  glowColor = "#7091E6",
  className,
}: DotFieldProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999, previousX: -9999, previousY: -9999, speed: 0 });
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    const glow = glowRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let offsetX = 0;
    let offsetY = 0;
    let resizeTimer: number | undefined;

    const rebuild = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      offsetX = rect.left + window.scrollX;
      offsetY = rect.top + window.scrollY;
      canvas.width = Math.max(1, width * devicePixelRatio);
      canvas.height = Math.max(1, height * devicePixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      const step = dotRadius + dotSpacing;
      const columns = Math.ceil(width / step);
      const rows = Math.ceil(height / step);
      const paddingX = (width % step) / 2;
      const paddingY = (height % step) / 2;
      dotsRef.current = Array.from({ length: rows * columns }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const ax = paddingX + column * step + step / 2;
        const ay = paddingY + row * step + step / 2;
        return { ax, ay, sx: ax, sy: ay };
      });
    };

    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(rebuild, 100);
    };

    const onMove = (event: MouseEvent) => {
      mouseRef.current.x = event.pageX - offsetX;
      mouseRef.current.y = event.pageY - offsetY;
    };

    const draw = () => {
      const mouse = mouseRef.current;
      const deltaX = mouse.previousX - mouse.x;
      const deltaY = mouse.previousY - mouse.y;
      mouse.speed += (Math.sqrt(deltaX * deltaX + deltaY * deltaY) - mouse.speed) * 0.45;
      mouse.previousX = mouse.x;
      mouse.previousY = mouse.y;
      const engagement = Math.min(mouse.speed / 7, 1);
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, gradientFrom);
      gradient.addColorStop(1, gradientTo);
      context.clearRect(0, 0, width, height);
      context.fillStyle = gradient;
      context.beginPath();
      const cursorRadiusSquared = cursorRadius * cursorRadius;
      const radius = dotRadius / 2;
      for (const dot of dotsRef.current) {
        const deltaX = mouse.x - dot.ax;
        const deltaY = mouse.y - dot.ay;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;
        if (distanceSquared < cursorRadiusSquared && engagement > 0.01) {
          const distance = Math.sqrt(distanceSquared);
          const force = (1 - distance / cursorRadius) ** 2 * bulgeStrength * engagement;
          const angle = Math.atan2(deltaY, deltaX);
          dot.sx += (dot.ax - Math.cos(angle) * force - dot.sx) * 0.15;
          dot.sy += (dot.ay - Math.sin(angle) * force - dot.sy) * 0.15;
        } else {
          dot.sx += (dot.ax - dot.sx) * 0.1;
          dot.sy += (dot.ay - dot.sy) * 0.1;
        }
        context.moveTo(dot.sx + radius, dot.sy);
        context.arc(dot.sx, dot.sy, radius, 0, TWO_PI);
      }
      context.fill();
      if (glow) {
        glow.setAttribute("cx", String(mouse.x));
        glow.setAttribute("cy", String(mouse.y));
        glow.style.opacity = String(engagement * 0.28);
      }
      if (!reducedMotion) frameRef.current = requestAnimationFrame(draw);
    };

    rebuild();
    draw();
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
    };
  }, [bulgeStrength, cursorRadius, dotRadius, dotSpacing, gradientFrom, gradientTo, glowColor, glowRadius]);

  return <div aria-hidden className={className}>
    <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs><radialGradient id="skyworlds-dot-glow"><stop offset="0%" stopColor={glowColor} /><stop offset="100%" stopColor="transparent" /></radialGradient></defs>
      <circle ref={glowRef} cx="-9999" cy="-9999" r={glowRadius} fill="url(#skyworlds-dot-glow)" style={{ opacity: 0 }} />
    </svg>
  </div>;
});

DotField.displayName = "DotField";

export default DotField;
