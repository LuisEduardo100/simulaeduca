import React from "react";
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { HeaderConfig } from "@/types";

export interface ExamPdfData {
  title: string;
  teacherName: string;
  schoolName?: string | null;
  subject: string;
  gradeLevel: string;
  evaluation: string;
  headerConfig?: HeaderConfig | null;
  questions: {
    number: number;
    stem: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctAnswer: string;
    justification?: string;
    descriptorCode: string;
    hasImage?: boolean;
    imageDescription?: string;
    imageDataUri?: string; // data:image/...;base64,... para renderização inline
  }[];
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: 40,
    lineHeight: 1.4,
  },
  headerBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderBottomStyle: "solid",
    paddingBottom: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 3,
    color: "#444",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    fontSize: 9,
  },
  infoBox: {
    paddingBottom: 2,
  },
  customHeaderImage: {
    maxHeight: 80,
    objectFit: "contain",
    marginBottom: 8,
  },
  headerFieldsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
    fontSize: 9,
  },
  headerField: {
    fontSize: 9,
  },
  questionBlock: {
    marginBottom: 14,
  },
  questionNumber: {
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  option: {
    marginBottom: 2,
    paddingLeft: 8,
  },
  descriptorTag: {
    fontSize: 7,
    color: "#888",
    marginTop: 2,
  },
  keyTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  keyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 16,
  },
  keyItem: {
    width: 72,
    borderWidth: 0.5,
    borderColor: "#999",
    borderStyle: "solid",
    borderRadius: 3,
    padding: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  keyNum: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  keyAnswer: {
    fontSize: 9,
  },
  resolTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginBottom: 8,
    marginTop: 4,
  },
  resolItem: {
    marginBottom: 10,
  },
  resolHeader: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  resolText: {
    fontSize: 9,
    color: "#333",
    paddingLeft: 8,
    marginTop: 2,
  },
  // ─── Grade de gabarito do aluno (bubble sheet) ───
  answerGridContainer: {
    borderWidth: 1,
    borderColor: "#000",
    borderStyle: "solid",
    marginBottom: 14,
    padding: 8,
  },
  answerGridTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center" as const,
    marginBottom: 6,
    textTransform: "uppercase" as const,
  },
  answerGridColumnsWrap: {
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    gap: 20,
  },
  answerGridColumn: {
    flexGrow: 1,
  },
  answerGridRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    borderBottomStyle: "solid" as const,
    paddingVertical: 1.5,
    minHeight: 15,
  },
  answerGridRowAlt: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
    borderBottomStyle: "solid" as const,
    paddingVertical: 1.5,
    minHeight: 15,
    backgroundColor: "#f5f5f5",
  },
  answerGridNum: {
    width: 20,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textAlign: "center" as const,
  },
  answerGridBubble: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 1,
    borderColor: "#333",
    borderStyle: "solid" as const,
    marginHorizontal: 3,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  answerGridBubbleLetter: {
    fontSize: 7,
    fontFamily: "Helvetica",
    color: "#333",
  },
  // Layout 2 colunas
  twoColContainer: {
    flexDirection: "row",
    gap: 12,
  },
  twoColColumn: {
    flex: 1,
  },
  twoColPage: {
    fontFamily: "Helvetica",
    fontSize: 9,
    padding: 25,
    lineHeight: 1.3,
  },
  twoColQuestionBlock: {
    marginBottom: 8,
  },
  twoColQuestionNumber: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginBottom: 2,
  },
  twoColStem: {
    fontSize: 9,
  },
  twoColOption: {
    fontSize: 9,
    marginBottom: 1,
    paddingLeft: 6,
  },
  twoColDescriptorTag: {
    fontSize: 6,
    color: "#888",
    marginTop: 1,
  },
  // Imagem de questão
  questionImage: {
    maxHeight: 160,
    maxWidth: 350,
    objectFit: "contain" as const,
    marginTop: 4,
    marginBottom: 4,
    alignSelf: "center" as const,
  },
  twoColQuestionImage: {
    maxHeight: 100,
    maxWidth: 200,
    objectFit: "contain" as const,
    marginTop: 3,
    marginBottom: 3,
    alignSelf: "center" as const,
  },
  imageCaption: {
    fontSize: 7,
    color: "#666",
    textAlign: "center" as const,
    marginBottom: 4,
    fontStyle: "italic" as const,
  },
});

const ce = React.createElement;
const LETTERS = ["A", "B", "C", "D"];

function formatDate(dateStr?: string): string {
  if (!dateStr) return "__ / __ / ______";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("pt-BR");
  } catch {
    return dateStr;
  }
}

// ─── Grade de gabarito do aluno (bubble sheet) ────────────────────────────────

function AnswerGridRow(num: number, idx: number) {
  const rowStyle = idx % 2 === 0 ? styles.answerGridRow : styles.answerGridRowAlt;
  return ce(
    View,
    { key: `ag-${num}`, style: rowStyle },
    ce(Text, { style: styles.answerGridNum }, String(num)),
    ...LETTERS.map((letter) =>
      ce(
        View,
        { key: `ag-${num}-${letter}`, style: styles.answerGridBubble },
        ce(Text, { style: styles.answerGridBubbleLetter }, letter)
      )
    )
  );
}

function StudentAnswerGrid(totalQuestions: number) {
  // Dividir em colunas para ficar compacto (até 4 colunas para 26+ questões)
  const colCount = totalQuestions <= 10 ? 2 : totalQuestions <= 20 ? 3 : 4;
  const perCol = Math.ceil(totalQuestions / colCount);
  const columns: number[][] = [];
  for (let c = 0; c < colCount; c++) {
    const start = c * perCol + 1;
    const end = Math.min((c + 1) * perCol, totalQuestions);
    const col: number[] = [];
    for (let i = start; i <= end; i++) col.push(i);
    if (col.length > 0) columns.push(col);
  }

  return ce(
    View,
    { style: styles.answerGridContainer, wrap: false },
    ce(Text, { style: styles.answerGridTitle }, "Gabarito do Aluno"),
    ce(
      View,
      { style: styles.answerGridColumnsWrap },
      ...columns.map((col, cIdx) =>
        ce(
          View,
          { key: `col-${cIdx}`, style: styles.answerGridColumn },
          ...col.map((num, idx) => AnswerGridRow(num, idx))
        )
      )
    )
  );
}

// ─── Headers ──────────────────────────────────────────────────────────────────

function StandardHeader(data: ExamPdfData) {
  const hc = data.headerConfig;
  return ce(
    View,
    { style: styles.headerBorder },
    ce(Text, { style: styles.title }, `${data.evaluation} — ${data.subject}`),
    ce(Text, { style: styles.subtitle }, data.title),
    ce(
      Text,
      { style: styles.subtitle },
      hc?.school ? `${hc.school} · ${data.gradeLevel}` : data.gradeLevel
    ),
    ce(
      View,
      { style: styles.infoRow },
      ce(
        View,
        { style: styles.infoBox },
        ce(Text, null, "Aluno(a): ___________________________")
      ),
      ce(
        View,
        { style: styles.infoBox },
        ce(Text, null, `Turma: ${hc?.className ?? "__________"}`)
      ),
      ce(
        View,
        { style: styles.infoBox },
        ce(Text, null, `Data: ${formatDate(hc?.examDate)}`)
      )
    ),
    ce(
      View,
      { style: { marginTop: 4 } },
      ce(Text, null, `Professor(a): ${hc?.teacherName || "___________________________"}`)
    ),
    hc?.school
      ? ce(
          View,
          { style: { marginTop: 2 } },
          ce(Text, { style: styles.headerField }, `Escola: ${hc.school}`)
        )
      : null
  );
}

function CustomHeader(data: ExamPdfData) {
  const hc = data.headerConfig;
  const elements: React.ReactElement[] = [];

  // Imagem personalizada
  if (hc?.imageBase64 && hc.imageMimeType) {
    const src = `data:${hc.imageMimeType};base64,${hc.imageBase64}`;
    elements.push(
      ce(Image, { key: "img", src, style: styles.customHeaderImage })
    );
  }

  // Campos extras (se preenchidos)
  const fields: string[] = [];
  if (hc?.teacherName) fields.push(`Prof.: ${hc.teacherName}`);
  if (hc?.school) fields.push(`Escola: ${hc.school}`);
  if (hc?.discipline) fields.push(`Disciplina: ${hc.discipline}`);
  if (hc?.className) fields.push(`Turma: ${hc.className}`);
  if (hc?.examDate) fields.push(`Data: ${formatDate(hc.examDate)}`);

  if (fields.length > 0) {
    elements.push(
      ce(
        View,
        { key: "fields", style: styles.headerFieldsRow },
        ...fields.map((f, i) =>
          ce(Text, { key: `f${i}`, style: styles.headerField }, f)
        )
      )
    );
  }

  // Campos do aluno
  elements.push(
    ce(
      View,
      { key: "aluno", style: styles.infoRow },
      ce(
        View,
        { style: styles.infoBox },
        ce(Text, null, "Aluno(a): ___________________________")
      ),
      ce(
        View,
        { style: styles.infoBox },
        ce(Text, null, `Turma: ${hc?.className ?? "__________"}`)
      ),
      ce(
        View,
        { style: styles.infoBox },
        ce(Text, null, `Data: ${formatDate(hc?.examDate)}`)
      )
    )
  );

  return ce(View, { style: styles.headerBorder }, ...elements);
}

function NoHeader() {
  return ce(View, { style: { marginBottom: 20 } });
}

function buildHeader(data: ExamPdfData) {
  const mode = data.headerConfig?.mode ?? "standard";
  switch (mode) {
    case "custom":
      return CustomHeader(data);
    case "none":
      return NoHeader();
    case "standard":
    default:
      return StandardHeader(data);
  }
}

// ─── Markdown table parser for PDF ───────────────────────────────────────────

const TABLE_REGEX = /(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/g;

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

function parseMarkdownTables(text: string): { parts: ({ type: "text"; content: string } | { type: "table"; table: ParsedTable })[] } {
  const parts: ({ type: "text"; content: string } | { type: "table"; table: ParsedTable })[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TABLE_REGEX)) {
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) parts.push({ type: "text", content: before.trim() });

    const headerLine = match[1];
    const dataLines = match[3].trim().split("\n");

    const headers = headerLine.split("|").filter(c => c.trim()).map(c => c.trim());
    const rows = dataLines.map(line =>
      line.split("|").filter(c => c.trim()).map(c => c.trim())
    );

    parts.push({ type: "table", table: { headers, rows } });
    lastIndex = match.index! + match[0].length;
  }

  const remaining = text.slice(lastIndex);
  if (remaining.trim()) parts.push({ type: "text", content: remaining.trim() });

  return { parts };
}

const pdfTableStyles = StyleSheet.create({
  table: { marginVertical: 4, borderWidth: 0.5, borderColor: "#333" },
  headerRow: { flexDirection: "row", backgroundColor: "#e8e8e8", borderBottomWidth: 0.5, borderBottomColor: "#333" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc" },
  headerCell: { flex: 1, padding: 3, fontFamily: "Helvetica-Bold", fontSize: 8, borderRightWidth: 0.5, borderRightColor: "#ccc" },
  cell: { flex: 1, padding: 3, fontSize: 8, borderRightWidth: 0.5, borderRightColor: "#ccc" },
});

function renderStemWithTables(
  stem: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textStyle?: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): React.ReactElement<any>[] {
  const { parts } = parseMarkdownTables(stem);

  // No tables found — return plain text
  if (parts.length === 1 && parts[0].type === "text") {
    return [ce(Text, { key: "stem", ...(textStyle ? { style: textStyle } : {}) }, stem)];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elements: React.ReactElement<any>[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.type === "text") {
      elements.push(ce(Text, { key: `stem-${i}`, ...(textStyle ? { style: textStyle } : {}) }, part.content));
    } else {
      const { headers, rows } = part.table;
      const tableChildren = [
        ce(
          View,
          { key: "thead", style: pdfTableStyles.headerRow },
          ...headers.map((h, hi) =>
            ce(Text, { key: `th-${hi}`, style: pdfTableStyles.headerCell }, h)
          )
        ),
        ...rows.map((row, ri) =>
          ce(
            View,
            { key: `tr-${ri}`, style: pdfTableStyles.row },
            ...row.map((cell, ci) =>
              ce(Text, { key: `td-${ri}-${ci}`, style: pdfTableStyles.cell }, cell)
            )
          )
        ),
      ];
      elements.push(ce(View, { key: `table-${i}`, style: pdfTableStyles.table }, ...tableChildren));
    }
  }
  return elements;
}

// ─── Blocos de questão ────────────────────────────────────────────────────────

function QuestionBlock(q: ExamPdfData["questions"][number], twoCol: boolean) {
  const s = twoCol
    ? { block: styles.twoColQuestionBlock, num: styles.twoColQuestionNumber, stem: styles.twoColStem, opt: styles.twoColOption, tag: styles.twoColDescriptorTag, img: styles.twoColQuestionImage }
    : { block: styles.questionBlock, num: styles.questionNumber, stem: undefined, opt: styles.option, tag: styles.descriptorTag, img: styles.questionImage };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: React.ReactElement<any>[] = [
    ce(
      View,
      { key: "header", style: { flexDirection: "row" as const, justifyContent: "space-between" as const, marginBottom: 3 } },
      ce(Text, { style: s.num }, `Questão ${q.number}`),
      ce(Text, { style: s.tag }, `Descritor: ${q.descriptorCode}`)
    ),
    ...renderStemWithTables(q.stem, s.stem),
  ];

  // Renderizar imagem da questão (se disponível)
  if (q.hasImage && q.imageDataUri) {
    children.push(
      ce(Image, { key: "img", src: q.imageDataUri, style: s.img })
    );
    if (q.imageDescription) {
      children.push(
        ce(Text, { key: "caption", style: styles.imageCaption }, q.imageDescription)
      );
    }
  }

  children.push(
    ce(Text, { key: "a", style: s.opt }, `A) ${q.optionA}`),
    ce(Text, { key: "b", style: s.opt }, `B) ${q.optionB}`),
    ce(Text, { key: "c", style: s.opt }, `C) ${q.optionC}`),
    ce(Text, { key: "d", style: s.opt }, `D) ${q.optionD}`)
  );

  return ce(
    View,
    { key: String(q.number), style: s.block, wrap: false },
    ...children
  );
}

// ─── Documentos ───────────────────────────────────────────────────────────────

function ExamDocument(data: ExamPdfData) {
  const columns = data.headerConfig?.columns ?? 1;
  const totalQ = data.questions.length;

  if (columns === 2) {
    const mid = Math.ceil(totalQ / 2);
    const leftQuestions = data.questions.slice(0, mid);
    const rightQuestions = data.questions.slice(mid);

    return ce(
      Document,
      null,
      ce(
        Page,
        { size: "A4", style: styles.twoColPage },
        buildHeader(data),
        StudentAnswerGrid(totalQ),
        ce(
          View,
          { style: styles.twoColContainer },
          ce(
            View,
            { style: styles.twoColColumn },
            ...leftQuestions.map((q) => QuestionBlock(q, true))
          ),
          ce(
            View,
            { style: styles.twoColColumn },
            ...rightQuestions.map((q) => QuestionBlock(q, true))
          )
        )
      )
    );
  }

  // Layout 1 coluna (padrão)
  return ce(
    Document,
    null,
    ce(
      Page,
      { size: "A4", style: styles.page },
      buildHeader(data),
      StudentAnswerGrid(totalQ),
      ...data.questions.map((q) => QuestionBlock(q, false))
    )
  );
}

function AnswerKeyDocument(data: ExamPdfData) {
  return ce(
    Document,
    null,
    ce(
      Page,
      { size: "A4", style: styles.page },
      ce(Text, { style: styles.keyTitle }, `GABARITO — ${data.title}`),
      ce(
        Text,
        { style: styles.subtitle },
        [
          data.headerConfig?.teacherName ? `Prof.: ${data.headerConfig.teacherName}` : null,
          data.evaluation,
          data.subject,
          data.gradeLevel,
        ].filter(Boolean).join(" · ")
      ),
      // Grid de respostas
      ce(
        View,
        { style: { ...styles.keyRow, marginTop: 12 } },
        ...data.questions.map((q) =>
          ce(
            View,
            { key: String(q.number), style: styles.keyItem },
            ce(Text, { style: styles.keyNum }, `${q.number}.`),
            ce(Text, { style: styles.keyAnswer }, q.correctAnswer),
            ce(Text, { style: styles.descriptorTag }, q.descriptorCode)
          )
        )
      ),
      // Justificativas completas
      ce(Text, { style: styles.resolTitle }, "Justificativas e Resoluções:"),
      ...data.questions.map((q) =>
        ce(
          View,
          { key: `r${q.number}`, style: styles.resolItem, wrap: false },
          ce(
            Text,
            { style: styles.resolHeader },
            `Q${q.number} (${q.descriptorCode}) — Gabarito: ${q.correctAnswer}`
          ),
          ce(
            Text,
            { style: { ...styles.resolText, fontStyle: "italic" as const } },
            q.stem.length > 200 ? q.stem.slice(0, 200) + "..." : q.stem
          ),
          q.justification
            ? ce(
                Text,
                { style: { ...styles.resolText, marginTop: 3 } },
                q.justification
              )
            : ce(
                Text,
                { style: { ...styles.resolText, color: "#999", marginTop: 2 } },
                "(Justificativa não disponível)"
              )
        )
      )
    )
  );
}

export async function generateExamPdf(data: ExamPdfData): Promise<Buffer> {
  return renderToBuffer(ExamDocument(data));
}

export async function generateAnswerKeyPdf(data: ExamPdfData): Promise<Buffer> {
  return renderToBuffer(AnswerKeyDocument(data));
}
