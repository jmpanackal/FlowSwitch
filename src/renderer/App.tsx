import { useEffect, useState } from 'react';
import type { Profile } from '../types/profile';


export default function App() {
  // Store the profile data once it's received
  const [profile, setProfile] = useState<Profile | null>(null);


  // Register IPC listener on mount
  useEffect(() => {
    if (window.electron?.onProfileLoaded) {
      window.electron.onProfileLoaded((profileData) => {
        console.log('🟢 Received profile in React:', profileData);
        setProfile(profileData); // Update React state with the profile
      });
    }
  }, []);

  // Button to request the profile from Electron
  const launchTest = () => {
    console.log('🟦 Button clicked');
    if (window.electron?.launchProfile) {
      console.log('🟩 Calling launchProfile...');
      window.electron.launchProfile('work-mode');
    } else {
      console.warn('🟥 window.electron.launchProfile is not defined');
    }
  };

  return (
    <div className="p-4 text-white font-sans">
      <h1 className="text-xl font-bold text-blue-400">
        🚀 FlowSwitch UI is live!
      </h1>

      <button
        onClick={launchTest}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Launch Work Profile
      </button>

      <button
        onClick={() => console.log('🟦 Create Profile button clicked')}
        className="mt-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
      >
        Create Profile
      </button>

      {/* Display profile data if available */}
      {profile && (
        <div className="mt-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-green-400">
            {profile.icon} {profile.name}
          </h2>
          <p className="text-sm text-gray-300">ID: {profile.id}</p>
          <p className="text-sm text-gray-400 mt-2">
            Volume: {profile.volume}
          </p>
          <p className="text-sm text-gray-400">Tags: {profile.tags?.join(', ')}</p>
          <p className="text-sm text-gray-400 mt-2">
            Actions: {profile.actions?.length || 0}
          </p>
        </div>
      )}
    </div>
  );
}
