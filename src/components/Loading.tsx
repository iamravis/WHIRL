export function Loading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-500" />
    </div>
  )
} 

export function VerticalBarsLoading({ showLabel = true, elapsedTime = 0 }: { showLabel?: boolean, elapsedTime?: number }) {
  // Format elapsed time as minutes:seconds
  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="flex items-center">
      {/* Enhanced vertical line loading indicator - centered fluctuation */}
      <div className="flex items-center h-6 space-x-1.5 mr-3">
        <div className="w-1 bg-gray-400 dark:bg-gray-700 rounded-full h-5" style={{ 
          animation: 'loadingBarScale 0.8s ease-in-out infinite',
          animationDelay: '0s',
          transformOrigin: 'center'
        }}></div>
        <div className="w-1 bg-gray-400 dark:bg-gray-700 rounded-full h-5" style={{ 
          animation: 'loadingBarScale 0.8s ease-in-out infinite',
          animationDelay: '0.25s',
          transformOrigin: 'center'
        }}></div>
        <div className="w-1 bg-gray-400 dark:bg-gray-700 rounded-full h-5" style={{ 
          animation: 'loadingBarScale 0.8s ease-in-out infinite',
          animationDelay: '0.5s',
          transformOrigin: 'center'
        }}></div>
      </div>
      {showLabel && elapsedTime > 0 && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatElapsedTime(elapsedTime)}
        </span>
      )}
      <style jsx global>{`
        @keyframes loadingBarScale {
          0%, 100% {
            transform: scaleY(1);
          }
          50% {
            transform: scaleY(0.4);
          }
        }
      `}</style>
    </div>
  )
} 