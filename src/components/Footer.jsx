import React from 'react';

function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Main Footer Content */}
        <div className="flex flex-wrap justify-between items-start gap-8 mb-6">
          {/* Company Info */}
          <div className="flex-1 min-w-[250px]">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              LoanBeacons™
            </h3>
            <p className="text-sm text-gray-600">
              Guiding Smarter Loan Structure Decisions
            </p>
          </div>

          {/* Quick Links */}
          <div className="flex-1 min-w-[150px]">
            <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">
              Platform
            </h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>Features</li>
              <li>Pricing</li>
              <li>Documentation</li>
            </ul>
          </div>

          {/* Support */}
          <div className="flex-1 min-w-[150px]">
            <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">
              Support
            </h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>Help Center</li>
              <li>Contact Us</li>
              <li>API Status</li>
            </ul>
          </div>
        </div>

        {/* Legal Bar */}
        <div className="pt-6 border-t border-gray-200">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
            {/* Copyright */}
            <div className="text-xs text-gray-500">
              <div>© {currentYear} LoanBeacons, LLC. All rights reserved.</div>
              <div className="mt-1">
                <strong>LoanBeacons™</strong>, <strong>Lender Match™</strong>, <strong>AUS Rescue™</strong>, <strong>DPA Intelligence™</strong>, <strong>Decision Record™</strong>, and <strong>Smart Chat™</strong> are trademarks of LoanBeacons, LLC.
              </div>
            </div>

            {/* Legal Links */}
            <div className="flex gap-4 text-xs text-gray-600">
              <a href="#" className="hover:text-gray-900">Privacy Policy</a>
              <a href="#" className="hover:text-gray-900">Terms of Service</a>
              <a href="#" className="hover:text-gray-900">Cookie Policy</a>
            </div>
          </div>

          {/* Patent Notice */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4">
            <div className="flex items-start gap-3">
              <span className="text-lg">⚖️</span>
              <div className="flex-1">
                <div className="text-xs font-semibold text-gray-900 mb-1">
                  PATENT PENDING
                </div>
                <div className="text-[10px] text-gray-700 leading-relaxed">
                  This platform and its underlying technology are protected by U.S. Provisional Patent Application No. 63/739,290 filed February 24, 2026. The Loan Structure Intelligence system, canonical sequence methodology, and Decision Record technology are proprietary innovations of LoanBeacons, LLC. Unauthorized use, reproduction, or reverse engineering is strictly prohibited.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
