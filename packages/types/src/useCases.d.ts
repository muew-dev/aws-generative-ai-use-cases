export type HiddenUseCases = {
  generate?: boolean;
  summarize?: boolean;
  writer?: boolean;
  translate?: boolean;
};

export type HiddenUseCasesKeys = keyof HiddenUseCases;
