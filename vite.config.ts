import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 등 서브경로 정적 호스팅에서도 동작하도록 상대 경로 사용
  base: './',
})
