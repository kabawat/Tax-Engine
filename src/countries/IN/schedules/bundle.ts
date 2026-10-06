import type { IndiaScheduleEntry, IndiaScheduleRatePeriod } from './index.js';
import type { IndiaFullScheduleMeta } from './schedule-meta.js';
import ch01 from './hsn/ch-01.json' with { type: 'json' };
import ch02 from './hsn/ch-02.json' with { type: 'json' };
import ch03 from './hsn/ch-03.json' with { type: 'json' };
import ch04 from './hsn/ch-04.json' with { type: 'json' };
import ch05 from './hsn/ch-05.json' with { type: 'json' };
import ch07 from './hsn/ch-07.json' with { type: 'json' };
import ch08 from './hsn/ch-08.json' with { type: 'json' };
import ch09 from './hsn/ch-09.json' with { type: 'json' };
import ch10 from './hsn/ch-10.json' with { type: 'json' };
import ch11 from './hsn/ch-11.json' with { type: 'json' };
import ch12 from './hsn/ch-12.json' with { type: 'json' };
import ch13 from './hsn/ch-13.json' with { type: 'json' };
import ch14 from './hsn/ch-14.json' with { type: 'json' };
import ch15 from './hsn/ch-15.json' with { type: 'json' };
import ch16 from './hsn/ch-16.json' with { type: 'json' };
import ch17 from './hsn/ch-17.json' with { type: 'json' };
import ch18 from './hsn/ch-18.json' with { type: 'json' };
import ch19 from './hsn/ch-19.json' with { type: 'json' };
import ch20 from './hsn/ch-20.json' with { type: 'json' };
import ch21 from './hsn/ch-21.json' with { type: 'json' };
import ch22 from './hsn/ch-22.json' with { type: 'json' };
import ch23 from './hsn/ch-23.json' with { type: 'json' };
import ch24 from './hsn/ch-24.json' with { type: 'json' };
import ch25 from './hsn/ch-25.json' with { type: 'json' };
import ch26 from './hsn/ch-26.json' with { type: 'json' };
import ch27 from './hsn/ch-27.json' with { type: 'json' };
import ch28 from './hsn/ch-28.json' with { type: 'json' };
import ch30 from './hsn/ch-30.json' with { type: 'json' };
import ch31 from './hsn/ch-31.json' with { type: 'json' };
import ch32 from './hsn/ch-32.json' with { type: 'json' };
import ch33 from './hsn/ch-33.json' with { type: 'json' };
import ch34 from './hsn/ch-34.json' with { type: 'json' };
import ch35 from './hsn/ch-35.json' with { type: 'json' };
import ch36 from './hsn/ch-36.json' with { type: 'json' };
import ch37 from './hsn/ch-37.json' with { type: 'json' };
import ch38 from './hsn/ch-38.json' with { type: 'json' };
import ch39 from './hsn/ch-39.json' with { type: 'json' };
import ch40 from './hsn/ch-40.json' with { type: 'json' };
import ch41 from './hsn/ch-41.json' with { type: 'json' };
import ch42 from './hsn/ch-42.json' with { type: 'json' };
import ch43 from './hsn/ch-43.json' with { type: 'json' };
import ch44 from './hsn/ch-44.json' with { type: 'json' };
import ch45 from './hsn/ch-45.json' with { type: 'json' };
import ch46 from './hsn/ch-46.json' with { type: 'json' };
import ch47 from './hsn/ch-47.json' with { type: 'json' };
import ch48 from './hsn/ch-48.json' with { type: 'json' };
import ch49 from './hsn/ch-49.json' with { type: 'json' };
import ch50 from './hsn/ch-50.json' with { type: 'json' };
import ch51 from './hsn/ch-51.json' with { type: 'json' };
import ch52 from './hsn/ch-52.json' with { type: 'json' };
import ch53 from './hsn/ch-53.json' with { type: 'json' };
import ch54 from './hsn/ch-54.json' with { type: 'json' };
import ch55 from './hsn/ch-55.json' with { type: 'json' };
import ch56 from './hsn/ch-56.json' with { type: 'json' };
import ch57 from './hsn/ch-57.json' with { type: 'json' };
import ch58 from './hsn/ch-58.json' with { type: 'json' };
import ch59 from './hsn/ch-59.json' with { type: 'json' };
import ch64 from './hsn/ch-64.json' with { type: 'json' };
import ch65 from './hsn/ch-65.json' with { type: 'json' };
import ch66 from './hsn/ch-66.json' with { type: 'json' };
import ch67 from './hsn/ch-67.json' with { type: 'json' };
import ch68 from './hsn/ch-68.json' with { type: 'json' };
import ch69 from './hsn/ch-69.json' with { type: 'json' };
import ch70 from './hsn/ch-70.json' with { type: 'json' };
import ch71 from './hsn/ch-71.json' with { type: 'json' };
import ch72 from './hsn/ch-72.json' with { type: 'json' };
import ch73 from './hsn/ch-73.json' with { type: 'json' };
import ch74 from './hsn/ch-74.json' with { type: 'json' };
import ch75 from './hsn/ch-75.json' with { type: 'json' };
import ch76 from './hsn/ch-76.json' with { type: 'json' };
import ch78 from './hsn/ch-78.json' with { type: 'json' };
import ch79 from './hsn/ch-79.json' with { type: 'json' };
import ch80 from './hsn/ch-80.json' with { type: 'json' };
import ch81 from './hsn/ch-81.json' with { type: 'json' };
import ch82 from './hsn/ch-82.json' with { type: 'json' };
import ch83 from './hsn/ch-83.json' with { type: 'json' };
import ch84 from './hsn/ch-84.json' with { type: 'json' };
import ch85 from './hsn/ch-85.json' with { type: 'json' };
import ch86 from './hsn/ch-86.json' with { type: 'json' };
import ch87 from './hsn/ch-87.json' with { type: 'json' };
import ch88 from './hsn/ch-88.json' with { type: 'json' };
import ch89 from './hsn/ch-89.json' with { type: 'json' };
import ch90 from './hsn/ch-90.json' with { type: 'json' };
import ch91 from './hsn/ch-91.json' with { type: 'json' };
import ch92 from './hsn/ch-92.json' with { type: 'json' };
import ch93 from './hsn/ch-93.json' with { type: 'json' };
import ch94 from './hsn/ch-94.json' with { type: 'json' };
import ch95 from './hsn/ch-95.json' with { type: 'json' };
import ch96 from './hsn/ch-96.json' with { type: 'json' };
import ch97 from './hsn/ch-97.json' with { type: 'json' };
import ch98 from './hsn/ch-98.json' with { type: 'json' };
import sacFile from './sac/sac.json' with { type: 'json' };
import metaFile from './meta.json' with { type: 'json' };

interface ScheduleJsonEntry {
  readonly code: string;
  readonly description?: string;
  readonly rateHistory: readonly IndiaScheduleRatePeriod[];
}

interface ChapterFile {
  readonly chapter: string;
  readonly kind: 'HSN';
  readonly count: number;
  readonly entries: readonly ScheduleJsonEntry[];
}

interface SacFile {
  readonly kind: 'SAC';
  readonly count: number;
  readonly entries: readonly ScheduleJsonEntry[];
}

function withKind(
  kind: 'HSN' | 'SAC',
  entries: readonly ScheduleJsonEntry[],
): readonly IndiaScheduleEntry[] {
  return entries.map((entry) => ({
    code: entry.code,
    kind,
    ...(entry.description !== undefined ? { description: entry.description } : {}),
    rateHistory: entry.rateHistory,
  }));
}

const chapters = [ch01, ch02, ch03, ch04, ch05, ch07, ch08, ch09, ch10, ch11, ch12, ch13, ch14, ch15, ch16, ch17, ch18, ch19, ch20, ch21, ch22, ch23, ch24, ch25, ch26, ch27, ch28, ch30, ch31, ch32, ch33, ch34, ch35, ch36, ch37, ch38, ch39, ch40, ch41, ch42, ch43, ch44, ch45, ch46, ch47, ch48, ch49, ch50, ch51, ch52, ch53, ch54, ch55, ch56, ch57, ch58, ch59, ch64, ch65, ch66, ch67, ch68, ch69, ch70, ch71, ch72, ch73, ch74, ch75, ch76, ch78, ch79, ch80, ch81, ch82, ch83, ch84, ch85, ch86, ch87, ch88, ch89, ch90, ch91, ch92, ch93, ch94, ch95, ch96, ch97, ch98] as unknown as readonly ChapterFile[];
const sac = sacFile as unknown as SacFile;

export const INDIA_FULL_SCHEDULE_META = metaFile as unknown as IndiaFullScheduleMeta;

export const INDIA_FULL_SCHEDULE: readonly IndiaScheduleEntry[] = [
  ...chapters.flatMap((file) => withKind(file.kind, file.entries)),
  ...withKind(sac.kind, sac.entries),
];
