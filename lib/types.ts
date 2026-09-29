export type PresetType = "5mb" | "xml";

export type PresetLink = {
  type: PresetType;
  url: string;
  title?: string;
  size?: string;
  thumb?: string;
  source?: string;
  detail?: string;
  byAuthor?: boolean;
  pinned?: boolean;
};

export type VideoStats = {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
};

export type FindResult = {
  ok: boolean;
  found?: boolean;
  author?: string | null;
  videoUrl?: string;
  message?: string;
  presetLinks?: PresetLink[];
  otherLinks?: { url: string; source?: string; detail?: string }[];
  video?: { description?: string; stats?: VideoStats };
  error?: string;
};
