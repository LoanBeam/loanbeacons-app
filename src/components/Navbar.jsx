function Navbar() {
  return (
    <nav className="bg-blue-900 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏠</span>
            <span className="text-xl font-bold tracking-tight">LoanBeacons</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#" className="hover:text-blue-300 transition-colors font-medium">Home</a>
            <a href="#" className="hover:text-blue-300 transition-colors font-medium">Loans</a>
            <a href="#" className="hover:text-blue-300 transition-colors font-medium">About</a>
            <a href="#" className="hover:text-blue-300 transition-colors font-medium">Contact</a>
          </div>
          <button className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-medium transition-colors">
            Get Started
          </button>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
