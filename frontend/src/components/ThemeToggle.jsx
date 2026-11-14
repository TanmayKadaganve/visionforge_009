import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme/ThemeContext.jsx'

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  return <button className={`theme-toggle ${className}`.trim()} type="button" onClick={toggleTheme} aria-label={`Switch to ${nextTheme} mode`} title={`Switch to ${nextTheme} mode`}>
    {theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}
  </button>
}
