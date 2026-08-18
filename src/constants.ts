import type { Platform } from './types'

export const PLATFORMS: { value: Platform; label: string; hint: string }[] = [
  { value: 'twitter', label: 'Twitter / X', hint: 'Short, punchy, ~280 chars' },
  { value: 'linkedin', label: 'LinkedIn', hint: 'Professional, a few short paragraphs' },
  { value: 'instagram', label: 'Instagram caption', hint: 'Warm, emoji + hashtags' },
  { value: 'blog', label: 'Blog post', hint: 'Longer form with a heading' },
]

export const PLATFORM_LABEL: Record<Platform, string> = {
  twitter: 'Twitter / X',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  blog: 'Blog',
}

export const PLATFORM_LIMIT: Record<Platform, number> = { twitter: 280, linkedin: 3000, instagram: 2200, blog: 20000 }
