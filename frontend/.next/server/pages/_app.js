/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "pages/_app";
exports.ids = ["pages/_app"];
exports.modules = {

/***/ "./src/pages/_app.tsx":
/*!****************************!*\
  !*** ./src/pages/_app.tsx ***!
  \****************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {\n__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (/* binding */ App)\n/* harmony export */ });\n/* harmony import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-dev-runtime */ \"react/jsx-dev-runtime\");\n/* harmony import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ \"react\");\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var next_router__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/router */ \"./node_modules/next/router.js\");\n/* harmony import */ var next_router__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_router__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _store_auth_store__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../store/auth.store */ \"./src/store/auth.store.ts\");\n/* harmony import */ var _styles_globals_css__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../styles/globals.css */ \"./src/styles/globals.css\");\n/* harmony import */ var _styles_globals_css__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(_styles_globals_css__WEBPACK_IMPORTED_MODULE_4__);\nvar __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([_store_auth_store__WEBPACK_IMPORTED_MODULE_3__]);\n_store_auth_store__WEBPACK_IMPORTED_MODULE_3__ = (__webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__)[0];\n\n\n\n\n\nconst PUBLIC_ROUTES = [\n    \"/login\"\n];\nfunction App({ Component, pageProps }) {\n    const router = (0,next_router__WEBPACK_IMPORTED_MODULE_2__.useRouter)();\n    const { hydrate, user } = (0,_store_auth_store__WEBPACK_IMPORTED_MODULE_3__.useAuthStore)();\n    (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(()=>{\n        hydrate();\n    }, []);\n    (0,react__WEBPACK_IMPORTED_MODULE_1__.useEffect)(()=>{\n        const isPublic = PUBLIC_ROUTES.includes(router.pathname);\n        if (!user && !isPublic) {\n            const stored =  false ? 0 : null;\n            if (!stored) router.replace(\"/login\");\n        }\n    }, [\n        user,\n        router.pathname\n    ]);\n    return /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(Component, {\n        ...pageProps\n    }, void 0, false, {\n        fileName: \"C:\\\\Users\\\\Kira Jewels\\\\Downloads\\\\jewelflow-os\\\\jewelflow-os\\\\frontend\\\\src\\\\pages\\\\_app.tsx\",\n        lineNumber: 25,\n        columnNumber: 10\n    }, this);\n}\n\n__webpack_async_result__();\n} catch(e) { __webpack_async_result__(e); } });//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiLi9zcmMvcGFnZXMvX2FwcC50c3giLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDa0M7QUFDTTtBQUNXO0FBQ3BCO0FBRS9CLE1BQU1HLGdCQUFnQjtJQUFDO0NBQVM7QUFFakIsU0FBU0MsSUFBSSxFQUFFQyxTQUFTLEVBQUVDLFNBQVMsRUFBWTtJQUM1RCxNQUFNQyxTQUFTTixzREFBU0E7SUFDeEIsTUFBTSxFQUFFTyxPQUFPLEVBQUVDLElBQUksRUFBRSxHQUFHUCwrREFBWUE7SUFFdENGLGdEQUFTQSxDQUFDO1FBQ1JRO0lBQ0YsR0FBRyxFQUFFO0lBRUxSLGdEQUFTQSxDQUFDO1FBQ1IsTUFBTVUsV0FBV1AsY0FBY1EsUUFBUSxDQUFDSixPQUFPSyxRQUFRO1FBQ3ZELElBQUksQ0FBQ0gsUUFBUSxDQUFDQyxVQUFVO1lBQ3RCLE1BQU1HLFNBQVMsTUFBa0IsR0FBY0MsQ0FBcUIsR0FBYztZQUNsRixJQUFJLENBQUNELFFBQVFOLE9BQU9TLE9BQU8sQ0FBQztRQUM5QjtJQUNGLEdBQUc7UUFBQ1A7UUFBTUYsT0FBT0ssUUFBUTtLQUFDO0lBRTFCLHFCQUFPLDhEQUFDUDtRQUFXLEdBQUdDLFNBQVM7Ozs7OztBQUNqQyIsInNvdXJjZXMiOlsid2VicGFjazovL2pld2VsZmxvdy1vcy1mcm9udGVuZC8uL3NyYy9wYWdlcy9fYXBwLnRzeD9mOWQ2Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgQXBwUHJvcHMgfSBmcm9tICduZXh0L2FwcCc7XG5pbXBvcnQgeyB1c2VFZmZlY3QgfSBmcm9tICdyZWFjdCc7XG5pbXBvcnQgeyB1c2VSb3V0ZXIgfSBmcm9tICduZXh0L3JvdXRlcic7XG5pbXBvcnQgeyB1c2VBdXRoU3RvcmUgfSBmcm9tICcuLi9zdG9yZS9hdXRoLnN0b3JlJztcbmltcG9ydCAnLi4vc3R5bGVzL2dsb2JhbHMuY3NzJztcblxuY29uc3QgUFVCTElDX1JPVVRFUyA9IFsnL2xvZ2luJ107XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIEFwcCh7IENvbXBvbmVudCwgcGFnZVByb3BzIH06IEFwcFByb3BzKSB7XG4gIGNvbnN0IHJvdXRlciA9IHVzZVJvdXRlcigpO1xuICBjb25zdCB7IGh5ZHJhdGUsIHVzZXIgfSA9IHVzZUF1dGhTdG9yZSgpO1xuXG4gIHVzZUVmZmVjdCgoKSA9PiB7XG4gICAgaHlkcmF0ZSgpO1xuICB9LCBbXSk7XG5cbiAgdXNlRWZmZWN0KCgpID0+IHtcbiAgICBjb25zdCBpc1B1YmxpYyA9IFBVQkxJQ19ST1VURVMuaW5jbHVkZXMocm91dGVyLnBhdGhuYW1lKTtcbiAgICBpZiAoIXVzZXIgJiYgIWlzUHVibGljKSB7XG4gICAgICBjb25zdCBzdG9yZWQgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJyA/IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdqZl90b2tlbicpIDogbnVsbDtcbiAgICAgIGlmICghc3RvcmVkKSByb3V0ZXIucmVwbGFjZSgnL2xvZ2luJyk7XG4gICAgfVxuICB9LCBbdXNlciwgcm91dGVyLnBhdGhuYW1lXSk7XG5cbiAgcmV0dXJuIDxDb21wb25lbnQgey4uLnBhZ2VQcm9wc30gLz47XG59XG4iXSwibmFtZXMiOlsidXNlRWZmZWN0IiwidXNlUm91dGVyIiwidXNlQXV0aFN0b3JlIiwiUFVCTElDX1JPVVRFUyIsIkFwcCIsIkNvbXBvbmVudCIsInBhZ2VQcm9wcyIsInJvdXRlciIsImh5ZHJhdGUiLCJ1c2VyIiwiaXNQdWJsaWMiLCJpbmNsdWRlcyIsInBhdGhuYW1lIiwic3RvcmVkIiwibG9jYWxTdG9yYWdlIiwiZ2V0SXRlbSIsInJlcGxhY2UiXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///./src/pages/_app.tsx\n");

/***/ }),

/***/ "./src/store/auth.store.ts":
/*!*********************************!*\
  !*** ./src/store/auth.store.ts ***!
  \*********************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.a(module, async (__webpack_handle_async_dependencies__, __webpack_async_result__) => { try {\n__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   useAuthStore: () => (/* binding */ useAuthStore)\n/* harmony export */ });\n/* harmony import */ var zustand__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! zustand */ \"zustand\");\nvar __webpack_async_dependencies__ = __webpack_handle_async_dependencies__([zustand__WEBPACK_IMPORTED_MODULE_0__]);\nzustand__WEBPACK_IMPORTED_MODULE_0__ = (__webpack_async_dependencies__.then ? (await __webpack_async_dependencies__)() : __webpack_async_dependencies__)[0];\n\nconst useAuthStore = (0,zustand__WEBPACK_IMPORTED_MODULE_0__.create)((set)=>({\n        user: null,\n        token: null,\n        setAuth: (user, token)=>{\n            if (false) {}\n            set({\n                user,\n                token\n            });\n        },\n        clearAuth: ()=>{\n            if (false) {}\n            set({\n                user: null,\n                token: null\n            });\n        },\n        hydrate: ()=>{\n            if (true) return;\n            const token = localStorage.getItem(\"jf_token\");\n            const raw = localStorage.getItem(\"jf_user\");\n            if (token && raw) {\n                try {\n                    set({\n                        token,\n                        user: JSON.parse(raw)\n                    });\n                } catch  {}\n            }\n        }\n    }));\n\n__webpack_async_result__();\n} catch(e) { __webpack_async_result__(e); } });//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiLi9zcmMvc3RvcmUvYXV0aC5zdG9yZS50cyIsIm1hcHBpbmdzIjoiOzs7Ozs7OztBQUFpQztBQWtCMUIsTUFBTUMsZUFBZUQsK0NBQU1BLENBQVksQ0FBQ0UsTUFBUztRQUN0REMsTUFBTTtRQUNOQyxPQUFPO1FBRVBDLFNBQVMsQ0FBQ0YsTUFBTUM7WUFDZCxJQUFJLEtBQWtCLEVBQWEsRUFHbEM7WUFDREYsSUFBSTtnQkFBRUM7Z0JBQU1DO1lBQU07UUFDcEI7UUFFQU0sV0FBVztZQUNULElBQUksS0FBa0IsRUFBYSxFQUdsQztZQUNEUixJQUFJO2dCQUFFQyxNQUFNO2dCQUFNQyxPQUFPO1lBQUs7UUFDaEM7UUFFQVEsU0FBUztZQUNQLElBQUksSUFBa0IsRUFBYTtZQUNuQyxNQUFNUixRQUFRRSxhQUFhTyxPQUFPLENBQUM7WUFDbkMsTUFBTUMsTUFBTVIsYUFBYU8sT0FBTyxDQUFDO1lBQ2pDLElBQUlULFNBQVNVLEtBQUs7Z0JBQ2hCLElBQUk7b0JBQUVaLElBQUk7d0JBQUVFO3dCQUFPRCxNQUFNSyxLQUFLTyxLQUFLLENBQUNEO29CQUFLO2dCQUFJLEVBQUUsT0FBTSxDQUFDO1lBQ3hEO1FBQ0Y7SUFDRixJQUFJIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vamV3ZWxmbG93LW9zLWZyb250ZW5kLy4vc3JjL3N0b3JlL2F1dGguc3RvcmUudHM/N2E4MSJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBjcmVhdGUgfSBmcm9tICd6dXN0YW5kJztcblxuaW50ZXJmYWNlIEF1dGhVc2VyIHtcbiAgaWQ6IHN0cmluZztcbiAgZW1haWw6IHN0cmluZztcbiAgZmlyc3ROYW1lOiBzdHJpbmc7XG4gIGxhc3ROYW1lOiBzdHJpbmc7XG4gIHJvbGU6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEF1dGhTdGF0ZSB7XG4gIHVzZXI6IEF1dGhVc2VyIHwgbnVsbDtcbiAgdG9rZW46IHN0cmluZyB8IG51bGw7XG4gIHNldEF1dGg6ICh1c2VyOiBBdXRoVXNlciwgdG9rZW46IHN0cmluZykgPT4gdm9pZDtcbiAgY2xlYXJBdXRoOiAoKSA9PiB2b2lkO1xuICBoeWRyYXRlOiAoKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgY29uc3QgdXNlQXV0aFN0b3JlID0gY3JlYXRlPEF1dGhTdGF0ZT4oKHNldCkgPT4gKHtcbiAgdXNlcjogbnVsbCxcbiAgdG9rZW46IG51bGwsXG5cbiAgc2V0QXV0aDogKHVzZXIsIHRva2VuKSA9PiB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnamZfdG9rZW4nLCB0b2tlbik7XG4gICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbSgnamZfdXNlcicsIEpTT04uc3RyaW5naWZ5KHVzZXIpKTtcbiAgICB9XG4gICAgc2V0KHsgdXNlciwgdG9rZW4gfSk7XG4gIH0sXG5cbiAgY2xlYXJBdXRoOiAoKSA9PiB7XG4gICAgaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnamZfdG9rZW4nKTtcbiAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCdqZl91c2VyJyk7XG4gICAgfVxuICAgIHNldCh7IHVzZXI6IG51bGwsIHRva2VuOiBudWxsIH0pO1xuICB9LFxuXG4gIGh5ZHJhdGU6ICgpID0+IHtcbiAgICBpZiAodHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCcpIHJldHVybjtcbiAgICBjb25zdCB0b2tlbiA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdqZl90b2tlbicpO1xuICAgIGNvbnN0IHJhdyA9IGxvY2FsU3RvcmFnZS5nZXRJdGVtKCdqZl91c2VyJyk7XG4gICAgaWYgKHRva2VuICYmIHJhdykge1xuICAgICAgdHJ5IHsgc2V0KHsgdG9rZW4sIHVzZXI6IEpTT04ucGFyc2UocmF3KSB9KTsgfSBjYXRjaCB7fVxuICAgIH1cbiAgfSxcbn0pKTtcbiJdLCJuYW1lcyI6WyJjcmVhdGUiLCJ1c2VBdXRoU3RvcmUiLCJzZXQiLCJ1c2VyIiwidG9rZW4iLCJzZXRBdXRoIiwibG9jYWxTdG9yYWdlIiwic2V0SXRlbSIsIkpTT04iLCJzdHJpbmdpZnkiLCJjbGVhckF1dGgiLCJyZW1vdmVJdGVtIiwiaHlkcmF0ZSIsImdldEl0ZW0iLCJyYXciLCJwYXJzZSJdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///./src/store/auth.store.ts\n");

/***/ }),

/***/ "./src/styles/globals.css":
/*!********************************!*\
  !*** ./src/styles/globals.css ***!
  \********************************/
/***/ (() => {



/***/ }),

/***/ "next/dist/compiled/next-server/pages.runtime.dev.js":
/*!**********************************************************************!*\
  !*** external "next/dist/compiled/next-server/pages.runtime.dev.js" ***!
  \**********************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/next-server/pages.runtime.dev.js");

/***/ }),

/***/ "react":
/*!************************!*\
  !*** external "react" ***!
  \************************/
/***/ ((module) => {

"use strict";
module.exports = require("react");

/***/ }),

/***/ "react-dom":
/*!****************************!*\
  !*** external "react-dom" ***!
  \****************************/
/***/ ((module) => {

"use strict";
module.exports = require("react-dom");

/***/ }),

/***/ "react/jsx-dev-runtime":
/*!****************************************!*\
  !*** external "react/jsx-dev-runtime" ***!
  \****************************************/
/***/ ((module) => {

"use strict";
module.exports = require("react/jsx-dev-runtime");

/***/ }),

/***/ "zustand":
/*!**************************!*\
  !*** external "zustand" ***!
  \**************************/
/***/ ((module) => {

"use strict";
module.exports = import("zustand");;

/***/ }),

/***/ "fs":
/*!*********************!*\
  !*** external "fs" ***!
  \*********************/
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ "stream":
/*!*************************!*\
  !*** external "stream" ***!
  \*************************/
/***/ ((module) => {

"use strict";
module.exports = require("stream");

/***/ }),

/***/ "zlib":
/*!***********************!*\
  !*** external "zlib" ***!
  \***********************/
/***/ ((module) => {

"use strict";
module.exports = require("zlib");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/@swc"], () => (__webpack_exec__("./src/pages/_app.tsx")));
module.exports = __webpack_exports__;

})();