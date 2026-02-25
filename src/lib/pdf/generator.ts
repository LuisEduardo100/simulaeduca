import React from "react";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export interface ExamPdfData {
  title: string;
  teacherName: string;
  schoolName?: string | null;
  subject: string;
  gradeLevel: string;
  evaluation: string;
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
});

const ce = React.createElement;

function ExamDocument(data: ExamPdfData) {
  return ce(
    Document,
    null,
    ce(
      Page,
      { size: "A4", style: styles.page },
      // Header
      ce(
        View,
        { style: styles.headerBorder },
        ce(Text, { style: styles.title }, `${data.evaluation} — ${data.subject}`),
        ce(Text, { style: styles.subtitle }, data.title),
        ce(
          Text,
          { style: styles.subtitle },
          `${data.schoolName ?? ""} · ${data.gradeLevel}`
        ),
        ce(
          View,
          { style: styles.infoRow },
          ce(View, { style: styles.infoBox }, ce(Text, null, "Aluno(a): ___________________________")),
          ce(View, { style: styles.infoBox }, ce(Text, null, "Turma: __________")),
          ce(View, { style: styles.infoBox }, ce(Text, null, "Data: __ / __ / ______"))
        ),
        ce(
          View,
          { style: { marginTop: 4 } },
          ce(Text, null, `Professor(a): ${data.teacherName}`)
        )
      ),
      // Questions
      ...data.questions.map((q) =>
        ce(
          View,
          { key: String(q.number), style: styles.questionBlock, wrap: false },
          ce(Text, { style: styles.questionNumber }, `Questão ${q.number}`),
          ce(Text, null, q.stem),
          ce(Text, { style: styles.option }, `A) ${q.optionA}`),
          ce(Text, { style: styles.option }, `B) ${q.optionB}`),
          ce(Text, { style: styles.option }, `C) ${q.optionC}`),
          ce(Text, { style: styles.option }, `D) ${q.optionD}`),
          ce(Text, { style: styles.descriptorTag }, `Descritor: ${q.descriptorCode}`)
        )
      )
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
        `Prof.: ${data.teacherName} · ${data.evaluation} · ${data.subject} · ${data.gradeLevel}`
      ),
      // Answer grid
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
      // Resolutions
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
