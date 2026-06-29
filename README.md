# FDS 期末复习刷题网站

本项目把当前文件夹中的 3 个 PDF 标准答案卷和 PTA 上可见的 FDS 作业/练习题整理成一个离线刷题网站。

## 数据范围

- PDF 历年卷：203 题，带标准答案。
- PTA 期末练习和 HW1-HW15：201 题，含题面、选项、图片、代码题描述；学生页面未公开标准答案的题会作为自评题展示。
- 总计：404 题，PTA 图片已下载到 `public/assets/pintia/`。

## 使用

```bash
npm install
npm run generate:data
npm run dev
```

打开 `http://127.0.0.1:5173/`。

## 功能

- 按来源、题型、知识点、关键词筛选。
- PDF 客观题支持提交后自动判题。
- PTA 作业题支持题面复习、自评、手动加入错题本。
- 错题本和练习记录保存在浏览器 localStorage。
- 支持随机顺序、只看可自动判题、只看错题。

## 验证

```bash
npx vitest run
npm run build
node scripts/verify-ui.mjs
```
