import raw from "@/ui.json";

type UiTexts = {
  buttons: {
    search: string;
    searching: string;
    copy: string;
    copied: string;
    openPreset: string;
    openFile: string;
  };
  states: {
    loading: string;
    notFound: string;
  };
  footer: string[];
};

export const ui: UiTexts = raw;
