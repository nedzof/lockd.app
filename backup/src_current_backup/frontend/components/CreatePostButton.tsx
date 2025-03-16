import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FiPlus } from 'react-icons/fi';
import CreatePost from './CreatePost';

interface CreatePostButtonProps {
  onPostCreated?: () => void;
  className?: string;
}

const CreatePostButton: React.FC<CreatePostButtonProps> = ({ 
  onPostCreated,
  className = ''
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  // Default button class if none is provided
  const buttonClass = className || 'px-6 py-3 bg-gradient-to-r from-[#00ffa3] to-[#00ff9d] rounded-xl font-medium hover:shadow-lg hover:from-[#00ff9d] hover:to-[#00ffa3] transition-all duration-300 transform hover:scale-105';

  return (
    <>
      <button
        onClick={openModal}
        className={`${buttonClass} group`}
      >
        <div className="relative flex items-center space-x-2 text-black">
          <FiPlus className="w-5 h-5" />
          <span>Create Post</span>
        </div>
        <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 rounded-xl transition-all duration-300"></div>
        <div className="absolute inset-0 bg-[#00ffa3] opacity-0 group-hover:opacity-20 blur-xl transition-all duration-300 rounded-xl"></div>
      </button>

      {/* Use React Portal to render the modal at the root level */}
      {isModalOpen && createPortal(
        <CreatePost 
          isOpen={isModalOpen} 
          onClose={closeModal} 
          onPostCreated={onPostCreated} 
        />,
        document.body
      )}
    </>
  );
};

export default CreatePostButton;
