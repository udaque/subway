import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 버전 = v0.1.<커밋 수> — 푸시(커밋)마다 자동 증가.
// 번들 파일명 해시가 바뀌므로 새 버전은 자연스럽게 캐시 버스트된다.
let commitCount = '0'
try {
  commitCount = execSync('git rev-list --count HEAD').toString().trim()
} catch {
  /* git 없는 환경(로컬 zip 등)에서는 0 */
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 등 서브경로 정적 호스팅에서도 동작하도록 상대 경로 사용
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(`v0.1.${commitCount}`),
  },
  // 구형 Safari에서도 번들이 파싱되도록 낮은 타깃으로 트랜스파일
  build: {
    target: ['es2018', 'safari13'],
  },
})
