# resume-custom

데이터 + 컴포넌트 + 테마 + variant 기반 이력서 시스템.

## 구조

```
data/        콘텐츠 (YAML)
components/  Handlebars 파셜
templates/   레이아웃 + CSS
themes/      색상 토큰
variants/    회사별 설정
scripts/     빌드
legacy/      원본 HTML 보존 (회귀 검증용)
dist/        빌드 결과 (gitignored)
```

## 사용

```bash
npm install
npm run build:default   # variants/_default.yml 로 dist/default/index.html 생성
```

## 새 회사용 이력서 만들기

1. `variants/companyX.yml` 작성 (`extends: _default.yml`)
2. `node scripts/build.mjs companyX`
3. `dist/companyX/index.html`
