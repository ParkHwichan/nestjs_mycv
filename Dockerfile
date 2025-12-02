# =====================
# 빌드 스테이지
# =====================
FROM node:20-alpine AS builder

WORKDIR /app

# 의존성 파일 복사
COPY package*.json ./

# 의존성 설치
RUN npm ci

# 소스 코드 복사
COPY . .

# 빌드
RUN npm run build

# =====================
# 프로덕션 스테이지
# =====================
FROM node:20-alpine AS production

WORKDIR /app

# 프로덕션 의존성만 설치
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 빌드된 파일 복사
COPY --from=builder /app/dist ./dist

# public 폴더 복사 (정적 파일)
COPY --from=builder /app/public ./public

# 보안: non-root 유저 사용
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 && \
    chown -R nestjs:nodejs /app

USER nestjs

# 환경 변수
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api || exit 1

CMD ["node", "dist/main"]

