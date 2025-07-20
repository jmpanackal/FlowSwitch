export default function App() {
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
    <div className="p-4 text-xl font-bold text-blue-400">
      🚀 FlowSwitch UI is live!

      <button
        onClick={launchTest}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Launch Work Profile
      </button>
    </div>
  );
}
