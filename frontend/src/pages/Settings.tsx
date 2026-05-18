import { useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { PageHeader, Card, Button, Input, Alert, Modal } from '../components/ui'
import { Palette, Type, Layout, Save, FileSpreadsheet, Trash2 } from 'lucide-react'
import { clearRecords, downloadFullActivityReport, freshStart } from '../api'
import { saveBlobResponse } from '../utils/download'

const presetThemes = [
  { name: 'Ocean Blue', primary: '#1a6ee8', accent: '#0f9d58', sidebar: '#1e2640' },
  { name: 'Forest', primary: '#16a34a', accent: '#0891b2', sidebar: '#14532d' },
  { name: 'Midnight', primary: '#7c3aed', accent: '#db2777', sidebar: '#0f172a' },
  { name: 'Sunset', primary: '#ea580c', accent: '#d97706', sidebar: '#1c1917' },
  { name: 'Rose', primary: '#e11d48', accent: '#9333ea', sidebar: '#1e1b4b' },
  { name: 'Teal', primary: '#0d9488', accent: '#2563eb', sidebar: '#134e4a' },
]

const fontOptions = [
  { value: 'Inter, sans-serif', label: 'Inter (Default)' },
  { value: 'system-ui, sans-serif', label: 'System UI' },
  { value: '"DM Sans", sans-serif', label: 'DM Sans' },
  { value: '"IBM Plex Sans", sans-serif', label: 'IBM Plex Sans' },
  { value: 'Georgia, serif', label: 'Georgia (Serif)' },
]

const radiusOptions = [
  { value: '4px', label: 'Sharp' },
  { value: '8px', label: 'Rounded (Default)' },
  { value: '12px', label: 'Very Rounded' },
  { value: '16px', label: 'Pill-style' },
]

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const [saved, setSaved] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveSuccess, setArchiveSuccess] = useState(false)
  const [archiveError, setArchiveError] = useState('')
  const [archiveConfirm, setArchiveConfirm] = useState('')
  const [clearOpen, setClearOpen] = useState(false)
  const [clearLoading, setClearLoading] = useState(false)
  const [clearSuccess, setClearSuccess] = useState(false)
  const [clearError, setClearError] = useState('')
  const [clearConfirm, setClearConfirm] = useState('')

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const applyPreset = (preset: typeof presetThemes[0]) => {
    setTheme({ primaryColor: preset.primary, accentColor: preset.accent, sidebarColor: preset.sidebar })
  }

  const handleArchiveAndClean = async () => {
    if (archiveConfirm !== 'I approve') {
      setArchiveError('Type I approve exactly to archive and clean data.')
      return
    }
    setArchiveLoading(true)
    setArchiveError('')
    setArchiveSuccess(false)
    try {
      const response = await downloadFullActivityReport()
      saveBlobResponse(response, 'full_activity_report_all_time.xlsx')
      await freshStart('I approve')
      closeArchiveModal()
      setArchiveSuccess(true)
    } catch {
      setArchiveError('Could not create the full report and clean the database. No cleanup was completed if report generation failed.')
    } finally {
      setArchiveLoading(false)
    }
  }

  const closeArchiveModal = () => {
    setArchiveOpen(false)
    setArchiveConfirm('')
  }

  const closeClearModal = () => {
    setClearOpen(false)
    setClearConfirm('')
  }

  const handleClearRecords = async () => {
    if (clearConfirm !== 'I approve') {
      setClearError('Type I approve exactly to remove records.')
      return
    }
    setClearLoading(true)
    setClearError('')
    setClearSuccess(false)
    try {
      const response = await downloadFullActivityReport()
      saveBlobResponse(response, 'full_activity_report_all_time.xlsx')
      await clearRecords('I approve')
      closeClearModal()
      setClearSuccess(true)
    } catch {
      setClearError('Could not create the full report and remove records. No cleanup was completed if report generation failed.')
    } finally {
      setClearLoading(false)
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Customize the look and feel of your FX Ledger" />

      {saved && (
        <div className="mb-4">
          <Alert type="success" message="Settings saved successfully!" onClose={() => setSaved(false)} />
        </div>
      )}
      {archiveSuccess && (
        <div className="mb-4">
          <Alert type="success" message="Full report downloaded and database cleaned. House and developer users were preserved." onClose={() => setArchiveSuccess(false)} />
        </div>
      )}
      {archiveError && !archiveOpen && (
        <div className="mb-4">
          <Alert type="error" message={archiveError} onClose={() => setArchiveError('')} />
        </div>
      )}
      {clearSuccess && (
        <div className="mb-4">
          <Alert type="success" message="Records removed. House users, developer users, and currencies were preserved." onClose={() => setClearSuccess(false)} />
        </div>
      )}
      {clearError && !clearOpen && (
        <div className="mb-4">
          <Alert type="error" message={clearError} onClose={() => setClearError('')} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">

          {/* App Identity */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Layout size={16} className="text-[var(--color-primary)]" />
              <h2 className="text-sm font-semibold text-gray-800">App Identity</h2>
            </div>
            <Input
              label="App Name"
              value={theme.appName}
              onChange={e => setTheme({ appName: e.target.value })}
              placeholder="FX Ledger"
            />
          </Card>

          {/* Color Presets */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Palette size={16} className="text-[var(--color-primary)]" />
              <h2 className="text-sm font-semibold text-gray-800">Color Presets</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {presetThemes.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(preset)}
                  className="group relative p-3 rounded-xl border-2 transition hover:border-[var(--color-primary)] text-left"
                  style={{
                    borderColor: theme.primaryColor === preset.primary ? 'var(--color-primary)' : '#e5e7eb',
                  }}
                >
                  <div className="flex gap-1.5 mb-2">
                    <div className="w-5 h-5 rounded-full" style={{ background: preset.primary }} />
                    <div className="w-5 h-5 rounded-full" style={{ background: preset.accent }} />
                    <div className="w-5 h-5 rounded-full" style={{ background: preset.sidebar }} />
                  </div>
                  <p className="text-xs font-medium text-gray-700">{preset.name}</p>
                </button>
              ))}
            </div>
          </Card>

          {/* Custom Colors */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Palette size={16} className="text-[var(--color-primary)]" />
              <h2 className="text-sm font-semibold text-gray-800">Custom Colors</h2>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.primaryColor}
                    onChange={e => setTheme({ primaryColor: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                  />
                  <Input
                    value={theme.primaryColor}
                    onChange={e => setTheme({ primaryColor: e.target.value })}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.accentColor}
                    onChange={e => setTheme({ accentColor: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                  />
                  <Input
                    value={theme.accentColor}
                    onChange={e => setTheme({ accentColor: e.target.value })}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Sidebar Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.sidebarColor}
                    onChange={e => setTheme({ sidebarColor: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                  />
                  <Input
                    value={theme.sidebarColor}
                    onChange={e => setTheme({ sidebarColor: e.target.value })}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Typography & Layout */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Type size={16} className="text-[var(--color-primary)]" />
              <h2 className="text-sm font-semibold text-gray-800">Typography & Layout</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Font Family</label>
                <select
                  value={theme.fontFamily}
                  onChange={e => setTheme({ fontFamily: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  {fontOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Border Radius</label>
                <select
                  value={theme.borderRadius}
                  onChange={e => setTheme({ borderRadius: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  {radiusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setTheme({ compactMode: !theme.compactMode })}
                  className={`relative w-10 h-5 rounded-full transition-colors ${theme.compactMode ? 'bg-[var(--color-primary)]' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${theme.compactMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm text-gray-700">Compact Mode</span>
              </label>
            </div>
          </Card>
        </div>

        {/* Right column — Preview */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Preview</h2>
            <div className="rounded-xl overflow-hidden border border-gray-200" style={{ fontFamily: theme.fontFamily }}>
              {/* Mini sidebar */}
              <div className="flex">
                <div className="w-28 p-3" style={{ background: theme.sidebarColor }}>
                  <div className="w-7 h-7 rounded-lg mb-4 flex items-center justify-center text-white text-xs font-bold" style={{ background: theme.primaryColor }}>
                    FX
                  </div>
                  {['Dashboard', 'Orders', 'Wallets'].map(item => (
                    <div key={item} className="text-white/60 text-xs py-1.5 px-2 rounded mb-0.5">{item}</div>
                  ))}
                </div>
                {/* Mini content */}
                <div className="flex-1 p-3 bg-gray-50">
                  <div className="h-4 bg-gray-200 rounded mb-3 w-24" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    {[1, 2].map(i => (
                      <div key={i} className="bg-white rounded-lg p-2 border border-gray-100">
                        <div className="h-3 bg-gray-200 rounded mb-1 w-14" />
                        <div className="h-5 rounded w-10" style={{ background: theme.primaryColor + '33' }} />
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-gray-100">
                    <div className="h-2 bg-gray-200 rounded mb-2 w-full" />
                    <div className="h-2 bg-gray-100 rounded w-3/4" />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <div className="px-3 py-1.5 rounded text-white text-xs font-medium" style={{ background: theme.primaryColor, borderRadius: theme.borderRadius }}>
                  Primary
                </div>
                <div className="px-3 py-1.5 rounded text-white text-xs font-medium" style={{ background: theme.accentColor, borderRadius: theme.borderRadius }}>
                  Accent
                </div>
              </div>
              <p className="text-xs text-gray-500" style={{ fontFamily: theme.fontFamily }}>Sample text in {theme.fontFamily.split(',')[0].replace(/"/g, '')}</p>
            </div>
          </Card>

          {/* API Config */}
          <Card className="p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">API Configuration</h2>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">API Base URL</label>
              <input
                type="text"
                defaultValue={import.meta.env.VITE_API_URL || 'http://localhost:8000'}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                readOnly
              />
              <p className="text-xs text-gray-400">Set VITE_API_URL in your .env file to change this</p>
            </div>
          </Card>

          <Button className="w-full justify-center" icon={<Save size={16} />} onClick={handleSave}>
            Save Settings
          </Button>

          <Card className="p-6 border-red-100 bg-red-50/40">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 rounded-lg text-red-600">
                <Trash2 size={16} />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-red-900">Archive & Fresh Start</h2>
                <p className="text-xs text-red-700 mt-1">
                  Downloads an all-time Excel timeline of orders and transfers, then clears database records while preserving house and developer users.
                </p>
                <Button
                  className="w-full justify-center mt-4"
                  variant="danger"
                  icon={<FileSpreadsheet size={16} />}
                  onClick={() => { setArchiveError(''); setArchiveOpen(true) }}
                >
                  Export Full Report & Clean Data
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-red-100 bg-white">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 rounded-lg text-red-600">
                <Trash2 size={16} />
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-red-900">Remove Records</h2>
                <p className="text-xs text-red-700 mt-1">
                  Downloads a full all-time activity report, then clears ledger activity, wallets, audit logs, and client users while keeping house users, developer users, and currencies.
                </p>
                <Button
                  className="w-full justify-center mt-4"
                  variant="danger"
                  icon={<Trash2 size={16} />}
                  onClick={() => { setClearError(''); setClearOpen(true) }}
                >
                  Remove Records
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={archiveOpen} onClose={closeArchiveModal} title="Export and Clean Database" size="sm">
        <div className="space-y-4">
          {archiveError && <Alert type="error" message={archiveError} onClose={() => setArchiveError('')} />}
          <p className="text-sm text-gray-600">
            This first downloads a full all-time Excel report, then permanently deletes ledger data, clients, wallets, currencies, and audit logs. House and developer users will be kept.
          </p>
          <Input
            label='Type "I approve" to continue'
            value={archiveConfirm}
            onChange={e => setArchiveConfirm(e.target.value)}
            placeholder="I approve"
          />
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
            <Button variant="secondary" size="sm" type="button" onClick={closeArchiveModal}>Cancel</Button>
            <Button
              variant="danger"
              size="sm"
              type="button"
              loading={archiveLoading}
              disabled={archiveConfirm !== 'I approve'}
              onClick={handleArchiveAndClean}
            >
              Export & Clean
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={clearOpen} onClose={closeClearModal} title="Remove Records" size="sm">
        <div className="space-y-4">
          {clearError && <Alert type="error" message={clearError} onClose={() => setClearError('')} />}
          <p className="text-sm text-gray-600">
            This first downloads a full all-time activity report, then permanently removes ledger records, wallets, audit logs, and client users. House users, developer users, and currencies will be kept.
          </p>
          <Input
            label='Type "I approve" to continue'
            value={clearConfirm}
            onChange={e => setClearConfirm(e.target.value)}
            placeholder="I approve"
          />
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end sm:gap-3">
            <Button variant="secondary" size="sm" type="button" onClick={closeClearModal}>Cancel</Button>
            <Button
              variant="danger"
              size="sm"
              type="button"
              loading={clearLoading}
              disabled={clearConfirm !== 'I approve'}
              onClick={handleClearRecords}
            >
              Export & Remove Records
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
