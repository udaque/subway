import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// 구형 Safari(<16.4)에는 CanvasRenderingContext2D.roundRect가 없다
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number | DOMPointInit | Iterable<number | DOMPointInit> = 0,
  ) {
    const radius = typeof r === 'number' ? r : 4
    const rr = Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2)
    this.moveTo(x + rr, y)
    this.arcTo(x + w, y, x + w, y + h, rr)
    this.arcTo(x + w, y + h, x, y + h, rr)
    this.arcTo(x, y + h, x, y, rr)
    this.arcTo(x, y, x + w, y, rr)
    this.closePath()
    return this
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
