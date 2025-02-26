import React from 'react';
import Layout from '../components/Layout';
import TagAdmin from '../components/TagAdmin';

const TagManagement: React.FC = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Tag Management</h1>
        <TagAdmin />
      </div>
    </Layout>
  );
};

export default TagManagement;
