import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProjectPage from '@pages/ProjectPage';
import ViewerPage from '@pages/ViewerPage';
import { ProjectsV2Page, ViewerV2Page } from './features/v2';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectPage />} />
        <Route path="/viewer/:projectId" element={<ViewerPage />} />

        {/* v2 routes — IndexedDB 기반 로컬 격리 작업 공간 */}
        <Route path="/v2" element={<Navigate to="/v2/projects" replace />} />
        <Route path="/v2/projects" element={<ProjectsV2Page />} />
        <Route path="/v2/viewer/:projectId" element={<ViewerV2Page />} />
      </Routes>
    </Router>
  );
}

export default App;
