import { Navigate, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { HomePage } from './pages/Home'
import { NewDoughPage } from './pages/NewDough'
import { WizardPage } from './pages/wizard/Wizard'
import { RecipePage } from './pages/recipe/RecipePage'
import { ImportPage } from './pages/Import'
import { GuidePage, GuidesPage } from './pages/Guides'
import { SettingsPage } from './pages/Settings'
import { ToolsIndex } from './pages/tools/ToolsIndex'
import { WaterTool } from './pages/tools/WaterTool'
import { ConverterTool } from './pages/tools/ConverterTool'
import { BakersTool } from './pages/tools/BakersTool'
import { YeastTimeTool } from './pages/tools/YeastTimeTool'
import { YeastTableTool } from './pages/tools/YeastTableTool'
import { CalibrateTool } from './pages/tools/CalibrateTool'
import { PanTool } from './pages/tools/PanTool'
import { StarterTool } from './pages/tools/StarterTool'
import { JournalPage } from './pages/journal/JournalPage'
import { BakeMode } from './pages/recipe/BakeMode'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="new" element={<NewDoughPage />} />
        <Route path="wizard/:step" element={<WizardPage />} />
        <Route path="recipe/:id" element={<RecipePage />} />
        <Route path="recipe/:id/bake" element={<BakeMode />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="guides" element={<GuidesPage />} />
        <Route path="guides/:id" element={<GuidePage />} />
        <Route path="tools" element={<ToolsIndex />} />
        <Route path="tools/water" element={<WaterTool />} />
        <Route path="tools/converter" element={<ConverterTool />} />
        <Route path="tools/bakers" element={<BakersTool />} />
        <Route path="tools/yeast-time" element={<YeastTimeTool />} />
        <Route path="tools/yeast-table" element={<YeastTableTool />} />
        <Route path="tools/calibrate" element={<CalibrateTool />} />
        <Route path="tools/pan" element={<PanTool />} />
        <Route path="tools/starter" element={<StarterTool />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
