# Campus Planner

웹프로그래밍 마지막 프로젝트용 캠퍼스 플래너입니다. React/Vite 프론트엔드, Express API, PostgreSQL, Docker, Nginx, GitHub Actions를 한 프로젝트 안에서 보여줍니다.

## 주요 기능

- 과제, 시험, 일정, 메모 CRUD
- 검색, 상태 필터, 유형 필터, 마감순/중요도순/최근순 정렬
- 완료 처리와 마감 임박 통계
- `localStorage`: 테마, 필터, 정렬 저장
- `sessionStorage`: 작성 중인 새 항목 초안 저장
- PostgreSQL `planner_items` 테이블 자동 생성

## 로컬 실행

의존성 설치:

```bash
npm install
```

API 서버 실행:

```bash
npm run server
```

다른 터미널에서 프론트엔드 실행:

```bash
npm run dev
```

빌드된 결과물을 API와 같은 주소에서 확인하려면:

```powershell
npm run build
$env:PORT=5173
npm start
```

`DATABASE_URL`이 없으면 API는 로컬 미리보기용 메모리 저장소를 사용합니다. PostgreSQL까지 같이 확인하려면 Docker Compose를 사용합니다.

```bash
docker compose up --build
```

이후 `http://localhost:8080`에서 확인합니다.

## 환경 변수

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/campus_planner
PGSSLMODE=disable
API_PORT=3001
PORT=8080
NODE_ENV=production
```

Render PostgreSQL을 사용할 때는 Render가 제공하는 `DATABASE_URL`을 Web Service 환경변수로 등록합니다.

## 검증

```bash
npm run lint
npm test
npm run build
docker compose up --build
```

확인할 엔드포인트:

```text
GET /api/health
GET /api/items
POST /api/items
PATCH /api/items/:id
DELETE /api/items/:id
```

## 배포

1. GitHub 저장소에 `last-lab` 내용을 커밋합니다.
2. Render에서 PostgreSQL 데이터베이스를 생성합니다.
3. Render에서 Docker Web Service를 생성하고 저장소를 연결합니다.
4. Web Service 환경변수에 `DATABASE_URL`, `NODE_ENV=production`을 설정합니다.
5. GitHub Actions secret `RENDER_DEPLOY_HOOK_URL`에 Render Deploy Hook URL을 등록합니다.
6. `main` 브랜치에 push하면 CI가 lint, test, build, Docker build를 수행한 뒤 Render 배포 훅을 호출합니다.

## 발표 영상 흐름

1. 서비스 첫 화면과 통계 소개
2. 일정 생성, 수정, 완료, 삭제 시연
3. 새로고침 후 DB 데이터 유지 확인
4. 테마/필터 localStorage 유지 확인
5. 작성 중 초안 sessionStorage 복구 확인
6. GitHub Actions와 Render 배포 구성 설명
