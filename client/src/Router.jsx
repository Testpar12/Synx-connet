import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Feeds from './pages/Feeds';
import FeedDetail from './pages/FeedDetail';
import FeedEdit from './pages/FeedEdit';
import JobDetail from './pages/JobDetail';
import FtpConnections from './pages/FtpConnections';
import Settings from './pages/Settings';

function Router() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/feeds" element={<Feeds />} />
      <Route path="/feeds/:id" element={<FeedDetail />} />
      <Route path="/feeds/:id/edit" element={<FeedEdit />} />
      <Route path="/feeds/new" element={<FeedEdit />} />
      <Route path="/jobs/:id" element={<JobDetail />} />
      <Route path="/ftp-connections" element={<FtpConnections />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  );
}

export default Router;
