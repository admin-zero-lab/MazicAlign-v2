import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProjectPage from '@pages/ProjectPage';
import ViewerPage from '@pages/ViewerPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectPage />} />
        <Route path="/viewer/:projectId" element={<ViewerPage />} />
      </Routes>
    </Router>
  );
}

export default App;
