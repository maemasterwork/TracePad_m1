export interface LText { en: string; fa?: string; fa_status?: 'machine' | 'reviewed' }
export interface CourseLesson {
  id: string; number: number; status: 'published' | 'planned'; title: LText; path?: string;
  chapters?: { n: number; id: string; title: string }[];
}
export interface Course {
  course: { id: string; title: LText; tagline: LText };
  lessons: CourseLesson[];
}

export type CodeBlockData = { type: 'code'; id: string; lang: string; code: string; info?: string; start: number; end: number };
export type ListPart = { type: 'text'; md: string } | { type: 'code'; id: string; lang: string; code: string; info?: string; start: number; end: number };
export type Block =
  | { type: 'paragraph' | 'quote'; raw: string; start: number; end: number }
  | { type: 'hr'; raw: string; start: number; end: number }
  | CodeBlockData & { raw: string }
  | { type: 'table'; raw: string; header: string[]; align: string[]; rows: string[][]; start: number; end: number }
  | { type: 'list'; raw: string; ordered: boolean; items: { parts: ListPart[] }[]; start: number; end: number }
  | { type: 'checklist'; raw: string; items: { checked: boolean; text: string }[]; start: number; end: number };

export interface Section { id: string; title: string; level: number; heading: string; line: number; blocks: Block[] }
export interface Chapter { n: number; id: string; title: string; heading: string; line: number; blocks: Block[]; sections: Section[] }
export interface Lesson {
  id: string; title: string;
  preamble: { blocks: Block[]; sections: Section[] };
  chapters: Chapter[];
  block_meta: Record<string, { after?: string[]; nondeterministic?: string; skip?: string; stdin?: string }>;
}
