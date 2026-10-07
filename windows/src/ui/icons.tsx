// Значки: тип пары, сайты, предметы. Вместо SF Symbols — lucide.
import {
  Presentation, PencilRuler, FlaskConical, MessagesSquare, GraduationCap, BadgeCheck, MessageCircleQuestion, BookOpen,
  Clock, Mail, FileText, Building2, Book, Cpu, IdCard, UserCircle, ShieldCheck, PlayCircle, Briefcase, Wrench, Library,
  Link, Globe, Calculator, Atom, Code2, Languages, Landmark, Dumbbell, Sigma, Leaf, Brain, Music, Palette, Scale, BarChart3,
  Zap, Ship, Fish, HeartPulse, Map as MapIcon, Laptop, Database, Network, Cog, Microscope, PenTool, Hammer
} from 'lucide-react'
import { kindStyle } from '../lib/schedule'

export function KindIcon({ kind, size = 14 }: { kind: string; size?: number }) {
  const ic = kindStyle(kind).icon
  const p = { size, strokeWidth: 2.4 }
  switch (ic) {
    case 'lecture': return <Presentation {...p} />
    case 'practice': return <PencilRuler {...p} />
    case 'lab': return <FlaskConical {...p} />
    case 'seminar': return <MessagesSquare {...p} />
    case 'exam': return <GraduationCap {...p} />
    case 'credit': return <BadgeCheck {...p} />
    case 'consult': return <MessageCircleQuestion {...p} />
    default: return <BookOpen {...p} />
  }
}

const SITE_ICONS: Record<string, any> = {
  'graduationcap.fill': GraduationCap, 'clock.fill': Clock, 'envelope.fill': Mail, 'doc.text.fill': FileText,
  'building.columns.fill': Building2, 'book.fill': Book, cpu: Cpu, 'person.text.rectangle.fill': IdCard,
  'person.crop.circle.fill': UserCircle, 'checkmark.shield.fill': ShieldCheck, 'play.rectangle.fill': PlayCircle,
  'briefcase.fill': Briefcase, 'wrench.and.screwdriver.fill': Wrench, 'books.vertical.fill': Library, link: Link, globe: Globe
}

export const SITE_ICON_CHOICES = Object.keys(SITE_ICONS)

export function SiteGlyph({ icon, size = 18 }: { icon: string; size?: number }) {
  const C = SITE_ICONS[icon] || Globe
  return <C size={size} strokeWidth={2.2} />
}

/** Свой цвет у каждого сайта — узнаётся с полувзгляда */
export function siteColor(url: string, title = ''): string {
  const u = url.toLowerCase()
  if (u.includes('sakai')) return 'linear-gradient(135deg,#f59e0b,#ef4444)'
  if (u.includes('ruz.')) return 'linear-gradient(135deg,#3b82f6,#06b6d4)'
  if (u.includes('edu.narfu')) return 'linear-gradient(135deg,#0ea5e9,#6366f1)'
  if (u.includes('office')) return 'linear-gradient(135deg,#10b981,#059669)'
  if (u.includes('lk.')) return 'linear-gradient(135deg,#8b5cf6,#ec4899)'
  if (u.includes('antiplagiat')) return 'linear-gradient(135deg,#14b8a6,#0f766e)'
  if (u.includes('library')) return 'linear-gradient(135deg,#a16207,#d97706)'
  let h = 0
  for (const ch of url + title) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const hue = h % 360
  return `linear-gradient(135deg, hsl(${hue} 75% 55%), hsl(${(hue + 40) % 360} 75% 48%))`
}

/** Значок предмета по ключевым словам (как SubjectIcon) */
export function SubjectGlyph({ subject, size = 18 }: { subject: string; size?: number }) {
  const s = subject.toLowerCase()
  const has = (...w: string[]) => w.some(x => s.includes(x))
  const C = has('математ', 'алгебр', 'геометр', 'анализ') ? Sigma
    : has('физик') ? Atom
      : has('хими') ? FlaskConical
        : has('программ', 'алгоритм', 'разработ', 'web', 'веб') ? Code2
          : has('язык', 'english', 'английск', 'немецк', 'лингв') ? Languages
            : has('истори', 'философ') ? Landmark
              : has('физическ', 'спорт', 'физкульт') ? Dumbbell
                : has('эконом', 'финанс', 'бухгалт') ? BarChart3
                  : has('право', 'юрид', 'закон') ? Scale
                    : has('биолог', 'эколог') ? Leaf
                      : has('психолог', 'педагог') ? Brain
                        : has('музык') ? Music
                          : has('дизайн', 'рисун', 'граф') ? Palette
                            : has('электр', 'энерг') ? Zap
                              : has('баз', 'данн', 'sql') ? Database
                                : has('сет', 'телеком', 'связ') ? Network
                                  : has('информат', 'компьют', 'цифров', 'ит ') ? Laptop
                                    : has('механ', 'машин', 'детал') ? Cog
                                      : has('судо', 'морск', 'флот') ? Ship
                                        : has('рыб') ? Fish
                                          : has('медиц', 'анатом', 'здоров') ? HeartPulse
                                            : has('географ', 'карт') ? MapIcon
                                              : has('микро', 'лаборат') ? Microscope
                                                : has('черч', 'инженер') ? PenTool
                                                  : has('строит', 'технолог') ? Hammer
                                                    : has('статист', 'вероятн', 'расч') ? Calculator
                                                      : BookOpen
  return <C size={size} strokeWidth={2.2} />
}

/** Цвет предмета: стабильно зависит от названия */
export function subjectColor(subject: string): string {
  let h = 0
  for (const ch of subject.toLowerCase()) h = (h * 33 + ch.charCodeAt(0)) >>> 0
  const palette = ['#4085ff', '#29bf6b', '#ff8c1a', '#1ab8c7', '#9e66f2', '#ed4d9e', '#f2404d', '#eba61f', '#14b8a6', '#6366f1', '#84cc16', '#f97316']
  return palette[h % palette.length]
}
