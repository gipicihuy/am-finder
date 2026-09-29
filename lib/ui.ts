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
  footer: {
    note: string;
    columns: { title: string; links: { label: string; href: string }[] }[];
    bottomLeft: string;
    bottomRight: string;
  };
};

export const ui: UiTexts = raw;
