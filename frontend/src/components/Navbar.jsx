import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X, ArrowUpRight } from 'lucide-react'
import Brand from './Brand.jsx'
import ThemeToggle from './ThemeToggle.jsx'

const links = [['Home', '#home'], ['How it works', '#how-it-works'], ['Features', '#features'], ['About', '#about'], ['Contact', '#contact']]
export default function Navbar() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return <header className="navbar"><div className="container nav-inner">
    <Brand />
    <nav className={`nav-links${open ? ' nav-open' : ''}`} aria-label="Main navigation">
      {links.map(([label, href]) => <a key={href} href={href} onClick={close}>{label}</a>)}
      <div className="mobile-actions"><Link to="/login" className="button button-quiet" onClick={close}>Log in</Link><Link to="/register" className="button button-primary" onClick={close}>Get started <ArrowUpRight size={16} /></Link></div>
    </nav>
    <div className="nav-actions"><Link to="/login" className="login-link">Log in</Link><Link to="/register" className="button button-primary nav-cta">Get started <ArrowUpRight size={16} /></Link><ThemeToggle/></div>
    <button className="menu-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>{open ? <X /> : <Menu />}</button>
  </div></header>
}
