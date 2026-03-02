"use client";

import { useState, useRef } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import type { HeaderConfig, HeaderMode } from "@/types";

interface HeaderSelectorProps {
  config: HeaderConfig;
  onChange: (config: HeaderConfig) => void;
  /** Dados do perfil do usuário para pré-preencher */
  defaultTeacherName?: string;
  defaultSchool?: string;
}

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

export function HeaderSelector({
  config,
  onChange,
  defaultTeacherName,
  defaultSchool,
}: HeaderSelectorProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(
    config.imageBase64 ? `data:${config.imageMimeType};base64,${config.imageBase64}` : null
  );
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Controla se o professor quer preencher dados extras no cabeçalho
  const [showExtraFields, setShowExtraFields] = useState(false);

  function handleModeChange(mode: HeaderMode) {
    onChange({ ...config, mode });
  }

  function handleFieldChange(field: keyof HeaderConfig, value: string) {
    onChange({ ...config, [field]: value });
  }

  function handleToggleExtraFields(checked: boolean) {
    setShowExtraFields(checked);
    if (!checked) {
      // Limpar campos extras quando desmarcar
      onChange({
        ...config,
        teacherName: undefined,
        school: undefined,
        className: undefined,
        examDate: undefined,
      });
    } else {
      // Pré-preencher com dados do perfil
      onChange({
        ...config,
        teacherName: defaultTeacherName ?? "",
        school: defaultSchool ?? "",
      });
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setImageError(null);

    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setImageError("Formato invalido. Use PNG ou JPG.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setImageError("Imagem muito grande. Maximo: 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      setImagePreview(result);
      onChange({
        ...config,
        imageBase64: base64,
        imageMimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setImagePreview(null);
    onChange({
      ...config,
      imageBase64: undefined,
      imageMimeType: undefined,
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Campos extras aparecem para standard-com-dados e custom
  const canShowExtraFields = config.mode === "standard" || config.mode === "custom";

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Cabecalho da Prova</h2>
      <p className="text-sm text-muted-foreground">
        Escolha como o cabecalho aparecera no PDF da prova.
      </p>

      <RadioGroup
        value={config.mode}
        onValueChange={(v) => handleModeChange(v as HeaderMode)}
        className="space-y-3"
      >
        {/* Opção 1: Cabeçalho padrão */}
        <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
          <RadioGroupItem value="standard" className="mt-0.5" />
          <div>
            <span className="text-sm font-medium">Cabecalho padrao</span>
            <p className="text-xs text-muted-foreground">
              Imprime a avaliacao, disciplina e serie no topo, com campos em branco para o aluno preencher (nome, turma, data).
            </p>
          </div>
        </label>

        {/* Opção 2: Cabeçalho personalizado (imagem) */}
        <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
          <RadioGroupItem value="custom" className="mt-0.5" />
          <div className="flex-1">
            <span className="text-sm font-medium">Cabecalho com imagem</span>
            <p className="text-xs text-muted-foreground">
              Upload de uma imagem (PNG/JPG, max 2MB) que sera usada como cabecalho no PDF.
            </p>

            {config.mode === "custom" && (
              <div className="mt-3 space-y-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleImageUpload}
                  className="text-xs"
                />
                {imageError && (
                  <p className="text-xs text-destructive">{imageError}</p>
                )}
                {imagePreview && (
                  <div className="relative inline-block">
                    <img
                      src={imagePreview}
                      alt="Preview do cabecalho"
                      className="max-h-32 rounded-md border object-contain"
                    />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    >
                      x
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </label>

        {/* Opção 3: Sem cabeçalho */}
        <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
          <RadioGroupItem value="none" className="mt-0.5" />
          <div>
            <span className="text-sm font-medium">Sem cabecalho</span>
            <p className="text-xs text-muted-foreground">
              Prova sem cabecalho — area em branco no topo.
            </p>
          </div>
        </label>
      </RadioGroup>

      {/* Toggle para adicionar dados extras ao cabeçalho */}
      {canShowExtraFields && (
        <div className="space-y-4 pt-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <Checkbox
              checked={showExtraFields}
              onCheckedChange={(v) => handleToggleExtraFields(v === true)}
            />
            <div>
              <span className="text-sm font-medium">
                Incluir dados adicionais no cabecalho
              </span>
              <p className="text-xs text-muted-foreground">
                Professor, escola, turma e data. Esses dados ja virao impressos na prova. Disciplina e serie ja aparecem automaticamente.
              </p>
            </div>
          </label>

          {showExtraFields && (
            <div className="grid grid-cols-2 gap-3 pl-8">
              <div>
                <Label htmlFor="header-teacher" className="text-xs">
                  Nome do Professor
                </Label>
                <Input
                  id="header-teacher"
                  className="mt-1"
                  placeholder="Nome do professor"
                  value={config.teacherName ?? ""}
                  onChange={(e) => handleFieldChange("teacherName", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="header-school" className="text-xs">
                  Escola
                </Label>
                <Input
                  id="header-school"
                  className="mt-1"
                  placeholder="Nome da escola"
                  value={config.school ?? ""}
                  onChange={(e) => handleFieldChange("school", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="header-class" className="text-xs">
                  Turma
                </Label>
                <Input
                  id="header-class"
                  className="mt-1"
                  placeholder="Ex: 9o A"
                  value={config.className ?? ""}
                  onChange={(e) => handleFieldChange("className", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="header-date" className="text-xs">
                  Data da Avaliacao
                </Label>
                <Input
                  id="header-date"
                  type="date"
                  className="mt-1"
                  value={config.examDate ?? ""}
                  onChange={(e) => handleFieldChange("examDate", e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
