import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 등 서브경로 정적 호스팅에서도 동작하도록 상대 경로 사용
  base: './',
  // 구형 Safari에서도 번들이 파싱되도록 낮은 타깃으로 트랜스파일
  build: {
    target: ['es2018', 'safari13'],
  },
})
