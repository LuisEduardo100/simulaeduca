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
    descriptorCode: string;
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
    borderBottomWidth: 0.5,
    borderBottomColor: "#000",
    borderBottomStyle: "solid",
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
  },
  resolItem: {
    marginBottom: 8,
  },
  resolHeader: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  resolText: {
    fontSize: 9,
    color: "#333",
    paddingLeft: 8,
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
    fontSize: 8,
    padding: 25,
    lineHeight: 1.3,
  },
  twoColQuestionBlock: {
    marginBottom: 8,
  },
  twoColQuestionNumber: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    marginBottom: 2,
  },
  twoColStem: {
    fontSize: 8,
  },
  twoColOption: {
    fontSize: 8,
    marginBottom: 1,
    paddingLeft: 6,
  },
  twoColDescriptorTag: {
    fontSize: 6,
    color: "#888",
    marginTop: 1,
  },
});

const ce = React.createElement;

function formatDate(dateStr?: string): string {
  if (!dateStr) return "__ / __ / ______";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("pt-BR");
  } catch {
    return dateStr;
  }
}

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

function QuestionBlock(q: ExamPdfData["questions"][number], twoCol: boolean) {
  const s = twoCol
    ? { block: styles.twoColQuestionBlock, num: styles.twoColQuestionNumber, stem: styles.twoColStem, opt: styles.twoColOption, tag: styles.twoColDescriptorTag }
    : { block: styles.questionBlock, num: styles.questionNumber, stem: undefined, opt: styles.option, tag: styles.descriptorTag };

  return ce(
    View,
    { key: String(q.number), style: s.block, wrap: false },
    ce(Text, { style: s.num }, `Questão ${q.number}`),
    ce(Text, s.stem ? { style: s.stem } : null, q.stem),
    ce(Text, { style: s.opt }, `A) ${q.optionA}`),
    ce(Text, { style: s.opt }, `B) ${q.optionB}`),
    ce(Text, { style: s.opt }, `C) ${q.optionC}`),
    ce(Text, { style: s.opt }, `D) ${q.optionD}`),
    ce(Text, { style: s.tag }, `Descritor: ${q.descriptorCode}`)
  );
}

function ExamDocument(data: ExamPdfData) {
  const columns = data.headerConfig?.columns ?? 1;

  if (columns === 2) {
    // Layout 2 colunas: dividir questões entre coluna esquerda e direita
    const mid = Math.ceil(data.questions.length / 2);
    const leftQuestions = data.questions.slice(0, mid);
    const rightQuestions = data.questions.slice(mid);

    return ce(
      Document,
      null,
      ce(
        Page,
        { size: "A4", style: styles.twoColPage },
        buildHeader(data),
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
      ce(
        View,
        { style: styles.keyRow },
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
      ce(Text, { style: styles.resolTitle }, "Resoluções:"),
      ...data.questions.map((q) =>
        ce(
          View,
          { key: `r${q.number}`, style: styles.resolItem },
          ce(
            Text,
            { style: styles.resolHeader },
            `Q${q.number} (${q.descriptorCode}) — Gabarito: ${q.correctAnswer}`
          ),
          ce(
            Text,
            { style: styles.resolText },
            q.stem.length > 100 ? q.stem.slice(0, 100) + "…" : q.stem
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
