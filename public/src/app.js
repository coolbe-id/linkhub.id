// src/app.js

// --- Firebase Initialization & Imports ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    where,
    serverTimestamp,
    deleteDoc,
    doc,
    updateDoc,
    increment,
    getDoc
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD9vbghwaETHsqzLgSSANb6720n34smamw",
    authDomain: "linkhub-ffc34.firebaseapp.com",
    projectId: "linkhub-ffc34",
    storageBucket: "linkhub-ffc34.firebasestorage.app",
    messagingSenderId: "638716492602",
    appId: "1:638716492602:web:685b9cd5c895f623cc6e03",
    measurementId: "G-2RDLQXEB9C"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// --- Firestore Collection References ---
const reelsCollection = collection(db, "reels");
const savedReelsCollection = collection(db, "savedReels");

// --- Cloudinary Configuration ---
const CLOUDINARY_CLOUD_NAME = "dl6iyeqrc";
const CLOUDINARY_UPLOAD_PRESET = "anon_video";

// --- Global Variables ---
let currentUser = null;
let savedReelIds = new Set(); // To keep track of saved reels by ID

// --- DOM Utility Functions ---

/**
 * Shows a status message to the user.
 * @param {HTMLElement} element - The DOM element to display the message in.
 * @param {string} message - The message to display.
 * @param {boolean} [isSuccess=false] - True if it's a success message, false for error/info.
 */
const showStatusMessage = (element, message, isSuccess = false) => {
    if (!element) {
        console.warn("Status message element not found for message:", message);
        return;
    }
    element.textContent = message;
    element.classList.remove('success', 'error');
    element.classList.add('show');
    if (isSuccess) {
        element.classList.add('success');
    } else {
        element.classList.add('error'); // Use 'error' for general messages, success for true success
    }
    setTimeout(() => {
        element.classList.remove('show');
        element.textContent = ''; // Clear text after fading out
    }, 5000); // Message stays for 5 seconds
};

/**
 * Applies a splitting animation to text content.
 * @param {HTMLElement} element - The element containing the text.
 */
const applySplittingAnimation = (element) => {
    if (!element) return;
    const text = element.textContent;
    element.innerHTML = ''; // Clear original content
    text.split('').forEach((char, index) => {
        const span = document.createElement('span');
        span.textContent = char;
        span.style.setProperty('--index', index); // Set the --index CSS variable
        element.appendChild(span);
    });
};

/**
 * Clears and resets splitting animations on an element.
 * @param {HTMLElement} element - The element to clear animations from.
 */
const clearAllAnimations = (element) => {
    if (!element) return;
    element.classList.remove('auto-animate', 'reset-animation');
    element.querySelectorAll('span').forEach(span => {
        span.style.animation = 'none';
        span.style.opacity = '';
        span.style.transform = '';
    });
    applySplittingAnimation(element); // Re-apply for potential re-animation
};

/**
 * Shows a loading animation within a target container.
 * @param {HTMLElement} targetContainer - The container to append the loading animation to.
 * @param {string} [message="Memuat..."] - The loading message.
 */
const showLoadingAnimation = (targetContainer, message = "Memuat...") => {
    if (!targetContainer) {
        console.warn("Target container for loading animation not found.");
        return;
    }

    // Clear any previous content and add loading animation
    targetContainer.innerHTML = `
        <div class="loading-animation show">
            <div class="pixel-spinner">
                <div class="pixel-spinner-inner"></div>
                <div class="pixel-spinner-inner"></div>
                <div class="pixel-spinner-inner"></div>
                <div class="pixel-spinner-inner"></div>
                <div class="pixel-spinner-inner"></div>
                <div class="pixel-spinner-inner"></div>
                <div class="pixel-spinner-inner"></div>
                <div class="pixel-spinner-inner"></div>
                <div class="pixel-spinner-inner"></div>
            </div>
            <p class="loading-text">${message}</p>
        </div>
    `;
};

/**
 * Hides the loading animation from a target container.
 * @param {HTMLElement} targetContainer - The container from which to remove the loading animation.
 */
const hideLoadingAnimation = (targetContainer) => {
    if (targetContainer) {
        const currentLoadingAnimation = targetContainer.querySelector('.loading-animation');
        if (currentLoadingAnimation) {
            currentLoadingAnimation.classList.remove('show');
            // Remove after transition
            currentLoadingAnimation.addEventListener('transitionend', () => {
                currentLoadingAnimation.remove();
            }, { once: true });
        }
    }
};

// --- Firebase Authentication Functions ---

/**
 * Registers a new user with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<firebase.User>}
 */
const registerUser = async (email, password) => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) {
        console.error("Error creating user:", error);
        throw error;
    }
};

/**
 * Logs in a user with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<firebase.User>}
 */
const loginUser = async (email, password) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) {
        console.error("Error logging in:", error);
        throw error;
    }
};

/**
 * Logs out the current user.
 * @returns {Promise<void>}
 */
const logoutUser = async () => {
    try {
        await signOut(auth);
        console.log("User logged out");
    } catch (error) {
        console.error("Error logging out:", error);
        throw error;
    }
};

/**
 * Observes changes in the user's authentication state.
 * @param {function(firebase.User | null): void} callback - The callback function to run when auth state changes.
 */
const observeAuthState = (callback) => {
    onAuthStateChanged(auth, callback);
};

// --- Cloudinary Upload Function ---

/**
 * Uploads a video file to Cloudinary.
 * @param {File} file - The video file to upload.
 * @returns {Promise<object>} - Cloudinary upload response data.
 */
const uploadVideoToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    try {
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`,
            {
                method: "POST",
                body: formData,
            }
        );
        const data = await response.json();
        if (response.ok) {
            return data;
        } else {
            throw new Error(data.error.message || "Cloudinary upload failed");
        }
    } catch (error) {
        console.error("Error uploading to Cloudinary:", error);
        throw error;
    }
};

// --- Firestore Interaction Functions ---

/**
 * Adds a new reel post to Firestore.
 * @param {string} userId
 * @param {string} userName
 * @param {string} title
 * @param {string} description
 * @param {string} videoUrl
 * @param {string} thumbnailUrl
 * @param {string} publicId
 * @param {string} contentType ('video', 'halaman', 'link')
 * @param {string|null} pageName - Required if contentType is 'halaman'.
 * @param {string|null} category - Required if contentType is 'halaman'.
 * @param {string|null} externalLink - Required if contentType is 'link'.
 * @returns {Promise<string>} - The ID of the newly added document.
 */
const addReelPost = async (userId, userName, title, description, videoUrl, thumbnailUrl, publicId, contentType, pageName = null, category = null, externalLink = null) => {
    try {
        const postData = {
            userId,
            userName,
            title,
            description,
            videoUrl,
            thumbnailUrl,
            publicId,
            contentType,
            createdAt: serverTimestamp(),
            views: 0,
            linkClicks: 0
        };

        if (contentType === 'halaman') {
            postData.pageName = pageName;
            postData.category = category;
        } else if (contentType === 'link') {
            postData.externalLink = externalLink;
        }

        const docRef = await addDoc(reelsCollection, postData);
        console.log("Reel post added with ID: ", docRef.id);
        return docRef.id;
    } catch (e) {
        console.error("Error adding document: ", e);
        throw e;
    }
};

/**
 * Fetches reel posts from Firestore based on filters.
 * @param {string|null} categoryFilter - Filter by category for 'halaman' content type.
 * @param {string|null} userIdFilter - Filter by specific user ID.
 * @param {string[]|null} reelIdsFilter - Filter by a list of reel IDs (e.g., for saved reels).
 * @returns {Promise<Array<object>>} - An array of reel post objects.
 */
const getReelPosts = async (categoryFilter = null, userIdFilter = null, reelIdsFilter = null) => {
    try {
        let q;
        if (userIdFilter) {
            q = query(reelsCollection, where("userId", "==", userIdFilter), orderBy("createdAt", "desc"));
        } else if (categoryFilter && categoryFilter !== 'all') {
            q = query(
                reelsCollection,
                where("contentType", "==", "halaman"),
                where("category", "==", categoryFilter),
                orderBy("createdAt", "desc")
            );
        } else if (reelIdsFilter && reelIdsFilter.length > 0) {
            // Firestore 'in' query has a limit of 10. For more, we fetch all and filter client-side.
            if (reelIdsFilter.length > 10) {
                console.warn("Filtering more than 10 reel IDs directly with 'in' query is not optimal. Fetching all and filtering in-memory.");
                const querySnapshot = await getDocs(query(reelsCollection, orderBy("createdAt", "desc")));
                const allReels = [];
                querySnapshot.forEach((doc) => {
                    allReels.push({ id: doc.id, ...doc.data() });
                });
                return allReels.filter(reel => reelIdsFilter.includes(reel.id));
            } else {
                 q = query(reelsCollection, where("__name__", "in", reelIdsFilter), orderBy("createdAt", "desc")); // Added orderBy for consistency
            }
        } else {
            q = query(reelsCollection, orderBy("createdAt", "desc"));
        }

        const querySnapshot = await getDocs(q);
        const reels = [];
        querySnapshot.forEach((doc) => {
            reels.push({ id: doc.id, ...doc.data() });
        });
        return reels;
    } catch (e) {
        console.error("Error fetching documents: ", e);
        throw e;
    }
};

/**
 * Increments the view count for a specific reel.
 * @param {string} reelId - The ID of the reel to increment views for.
 */
const incrementReelView = async (reelId) => {
    try {
        const reelRef = doc(db, "reels", reelId);
        await updateDoc(reelRef, {
            views: increment(1)
        });
    } catch (e) {
        console.error("Error incrementing reel view: ", e);
    }
};

/**
 * Increments the link click count for a specific reel.
 * @param {string} reelId - The ID of the reel to increment link clicks for.
 */
const incrementLinkClick = async (reelId) => {
    try {
        const reelRef = doc(db, "reels", reelId);
        await updateDoc(reelRef, {
            linkClicks: increment(1)
        });
    } catch (e) {
        console.error("Error incrementing link click: ", e);
    }
};

/**
 * Toggles the save status of a reel for a user.
 * @param {string} userId - The ID of the user.
 * @param {string} reelId - The ID of the reel.
 * @param {boolean} isSaved - True if the reel is currently saved, false otherwise.
 * @returns {Promise<boolean>} - True if toggle was successful.
 */
const toggleSaveReel = async (userId, reelId, isSaved) => {
    try {
        if (isSaved) {
            const q = query(savedReelsCollection, where("userId", "==", userId), where("reelId", "==", reelId));
            const snapshot = await getDocs(q);
            snapshot.forEach(async (docRef) => {
                await deleteDoc(doc(db, "savedReels", docRef.id));
            });
            savedReelIds.delete(reelId);
            console.log(`Reel ${reelId} unsaved by user ${userId}`);
        } else {
            await addDoc(savedReelsCollection, {
                userId: userId,
                reelId: reelId,
                savedAt: serverTimestamp()
            });
            savedReelIds.add(reelId);
            console.log(`Reel ${reelId} saved by user ${userId}`);
        }
        return true;
    } catch (e) {
        console.error("Error toggling save status: ", e);
        throw e;
    }
};

/**
 * Fetches all reel IDs saved by a specific user.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<Set<string>>} - A Set of saved reel IDs.
 */
const getSavedReelIds = async (userId) => {
    try {
        const q = query(savedReelsCollection, where("userId", "==", userId));
        const querySnapshot = await getDocs(q);
        const ids = new Set();
        querySnapshot.forEach(doc => {
            ids.add(doc.data().reelId);
        });
        return ids;
    } catch (e) {
        console.error("Error fetching saved reel IDs: ", e);
        return new Set();
    }
};

/**
 * Renders reel cards into a specified container.
 * @param {HTMLElement} containerElement - The DOM element to render reels into.
 * @param {Array<object>} reels - An array of reel data objects.
 * @param {boolean} [showSaveButton=true] - Whether to display the save/unsave button.
 * @param {boolean} [showAnalytics=false] - Whether to display view/click analytics.
 */
const renderReels = (containerElement, reels, showSaveButton = true, showAnalytics = false) => {
    if (!containerElement) {
        console.error("Container element for rendering reels is null.");
        return;
    }

    containerElement.innerHTML = ""; // Clear content including loading animation

    if (reels.length === 0) {
        containerElement.innerHTML = `<div class="empty-state-message">Tidak ada reels ditemukan.</div>`;
    } else {
        reels.forEach(reel => {
            const reelItem = document.createElement("div");
            reelItem.classList.add("reel-card");
            reelItem.dataset.reelId = reel.id;
            reelItem.dataset.videoUrl = reel.videoUrl;
            reelItem.dataset.contentType = reel.contentType;
            if (reel.contentType === 'halaman') {
                reelItem.dataset.pageName = reel.pageName;
                reelItem.dataset.category = reel.category;
            } else if (reel.contentType === 'link') {
                reelItem.dataset.externalLink = reel.externalLink;
            }

            let actionButtonHtml = '';
            if (reel.contentType === 'halaman') {
                actionButtonHtml = `<button class="reel-card__overlay-btn" data-action-type="page" data-page-name="${reel.pageName}" data-category="${reel.category}">Lihat Halaman ${reel.category || ''}</button>`;
            } else if (reel.contentType === 'link') {
                actionButtonHtml = `<button class="reel-card__overlay-btn reel-card__overlay-btn--affiliate" data-action-type="link" data-external-link="${reel.externalLink}">Kunjungi Tautan</button>`;
            }

            const isReelSaved = savedReelIds.has(reel.id);
            const saveButtonClass = isReelSaved ? 'save-btn saved' : 'save-btn';
            const saveButtonIcon = isReelSaved ? 'fas fa-bookmark' : 'far fa-bookmark';
            const saveButtonText = isReelSaved ? 'Tersimpan' : 'Simpan';

            const saveButtonHtml = showSaveButton && currentUser ?
                `<button class="reel-card__overlay-btn ${saveButtonClass}" data-reel-id="${reel.id}" data-is-saved="${isReelSaved}">
                    <i class="${saveButtonIcon}"></i> ${saveButtonText}
                </button>` : '';

            let analyticsInOverlayHtml = '';
            if (showAnalytics) {
                analyticsInOverlayHtml = `
                    <div class="reel-analytics-stats">
                        <span><i class="fas fa-eye"></i> ${reel.views || 0}</span>
                        <span><i class="fas fa-hand-pointer"></i> ${reel.linkClicks || 0}</span>
                    </div>
                `;
            }

            reelItem.innerHTML = `
                <img class="reel-card__video" src="${reel.thumbnailUrl || 'https://via.placeholder.com/300x400/000000/FFFFFF?text=No+Thumbnail'}" alt="Video Reel Thumbnail">
                <div class="reel-card__info">
                    <h3>${reel.title}</h3>
                    <p>Oleh: <a href="#" class="reel-card__uploader-link">${reel.userName || 'Anonim'}</a></p>
                    <p><i class="fas fa-eye"></i> ${reel.views || 0} Views | <i class="fas fa-heart"></i> 0 Likes</p>
                </div>
                <div class="reel-card__overlay">
                    <h3>${reel.title}</h3>
                    <p>${reel.description || 'Tidak ada deskripsi.'}</p>
                    ${analyticsInOverlayHtml}
                    <div class="reel-actions">
                        <button class="reel-card__overlay-btn watch-btn" data-video-url="${reel.videoUrl}"><i class="fas fa-play-circle"></i> Tonton</button>
                        ${actionButtonHtml}
                        ${saveButtonHtml}
                    </div>
                </div>
            `;
            containerElement.appendChild(reelItem);
        });

        // Add event listeners for watch buttons
        containerElement.querySelectorAll('.watch-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const reelId = event.currentTarget.closest('.reel-card').dataset.reelId;
                window.location.href = `watch-reel.html?id=${reelId}`;
            });
        });

        // Add event listeners for affiliate/action buttons
        containerElement.querySelectorAll('.reel-card__overlay-btn[data-action-type]').forEach(button => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                const actionType = event.currentTarget.dataset.actionType;
                const reelId = event.currentTarget.closest('.reel-card').dataset.reelId;
                incrementLinkClick(reelId);

                if (actionType === 'page') {
                    const pageName = event.currentTarget.dataset.pageName;
                    const category = event.currentTarget.dataset.category;
                    alert(`Mengarahkan ke halaman internal: ${pageName} (Kategori: ${category})`);
                    // In a real app, you would navigate to an internal page/route
                    console.log(`Navigating to internal page: ${pageName}, Category: ${category}`);
                } else if (actionType === 'link') {
                    const externalLink = event.currentTarget.dataset.externalLink;
                    // alert(`Membuka tautan eksternal: ${externalLink}`); // Use this for debugging, remove for production
                    console.log(`Opening external link: ${externalLink}`);
                    window.open(externalLink, '_blank');
                }
            });
        });

        // Add event listeners for save buttons
        containerElement.querySelectorAll('.save-btn').forEach(button => {
            button.addEventListener('click', async (event) => {
                event.stopPropagation();
                if (!currentUser) {
                    showStatusMessage(document.getElementById('general-status-message') || document.body, "Anda harus login untuk menyimpan reels.");
                    return;
                }
                const reelId = event.currentTarget.dataset.reelId;
                const isSaved = event.currentTarget.dataset.isSaved === 'true';

                try {
                    await toggleSaveReel(currentUser.uid, reelId, isSaved);
                    event.currentTarget.dataset.isSaved = !isSaved;
                    const icon = event.currentTarget.querySelector('i');
                    const textNode = Array.from(event.currentTarget.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '');

                    if (!isSaved) {
                        icon.classList.remove('far');
                        icon.classList.add('fas');
                        event.currentTarget.classList.add('saved');
                        if (textNode) textNode.textContent = ' Tersimpan';
                        showStatusMessage(document.getElementById('general-status-message') || document.body, "Reel berhasil disimpan!", true);
                    } else {
                        icon.classList.remove('fas');
                        icon.classList.add('far');
                        event.currentTarget.classList.remove('saved');
                        if (textNode) textNode.textContent = ' Simpan';
                        showStatusMessage(document.getElementById('general-status-message') || document.body, "Reel dihapus dari tersimpan.", true);
                        if (window.location.pathname.includes('saved-reels.html')) {
                            loadSavedReelsPage(currentUser.uid); // Reload saved reels if on that page
                        }
                    }
                } catch (error) {
                    console.error("Gagal mengubah status simpan:", error);
                    showStatusMessage(document.getElementById('general-status-message') || document.body, "Gagal mengubah status simpan.");
                }
            });
        });

        // Add event listener for clicking the entire reel card (for navigation to detail page)
        containerElement.querySelectorAll('.reel-card').forEach(card => {
            card.addEventListener('click', (event) => {
                // Only navigate if click is not on an action button or uploader link
                if (!event.target.closest('.reel-card__overlay-btn') && !event.target.closest('.reel-card__uploader-link')) {
                    const reelId = event.currentTarget.dataset.reelId;
                    window.location.href = `watch-reel.html?id=${reelId}`;
                }
            });
        });
    }
};

// --- Page-specific reel loading functions ---
const reelsList = document.getElementById("reels-list"); // For homepage
const exploreReelsList = document.getElementById("explore-reels-list"); // For explore page
const myReelsList = document.getElementById("my-reels-list"); // For my-reels page
const savedReelsList = document.getElementById("saved-reels-list"); // For saved-reels page
const analyticsReelsList = document.getElementById("analytics-reels-list"); // For analytics page

const loadHomePageReels = async () => {
    if (reelsList) {
        showLoadingAnimation(reelsList, "Memuat reels...");
        try {
            const reels = await getReelPosts();
            hideLoadingAnimation(reelsList);
            renderReels(reelsList, reels);
        } catch (error) {
            hideLoadingAnimation(reelsList);
            reelsList.innerHTML = `<div class="empty-state-message error-message">Gagal memuat reels: ${error.message}</div>`;
            console.error(error);
        }
    }
};

const loadExplorePageReels = async (category = 'all') => {
    if (exploreReelsList) {
        showLoadingAnimation(exploreReelsList, `Memuat reels kategori ${category}...`);
        try {
            const reels = await getReelPosts(category);
            hideLoadingAnimation(exploreReelsList);
            renderReels(exploreReelsList, reels);
        } catch (error) {
            hideLoadingAnimation(exploreReelsList);
            exploreReelsList.innerHTML = `<div class="empty-state-message error-message">Gagal memuat reels: ${error.message}</div>`;
            console.error(error);
        }
    }
};

const loadMyReelsPage = async (userId) => {
    if (myReelsList) {
        showLoadingAnimation(myReelsList, "Memuat reels Anda...");
        try {
            const reels = await getReelPosts(null, userId);
            hideLoadingAnimation(myReelsList);
            renderReels(myReelsList, reels, true); // Show save button (though it's user's own reel)
        } catch (error) {
            hideLoadingAnimation(myReelsList);
            myReelsList.innerHTML = `<div class="empty-state-message error-message">Gagal memuat reels Anda: ${error.message}</div>`;
            console.error(error);
        }
    }
};

const loadSavedReelsPage = async (userId) => {
    if (savedReelsList) {
        showLoadingAnimation(savedReelsList, "Memuat reels tersimpan...");
        try {
            // First, update savedReelIds if it hasn't been updated recently or if user logs in
            savedReelIds = await getSavedReelIds(userId);

            const savedIdsArray = Array.from(savedReelIds);
            if (savedIdsArray.length === 0) {
                hideLoadingAnimation(savedReelsList);
                savedReelsList.innerHTML = `<div class="empty-state-message">Belum ada reels yang disimpan.</div>`;
                return;
            }
            // Fetch reels using the saved IDs
            const reels = await getReelPosts(null, null, savedIdsArray);
            // Filter to ensure only truly saved reels (might be an edge case if reel was deleted)
            const foundReels = reels.filter(reel => savedIdsArray.includes(reel.id));

            hideLoadingAnimation(savedReelsList);
            renderReels(savedReelsList, foundReels, true); // Show save button to allow unsaving
        } catch (error) {
            hideLoadingAnimation(savedReelsList);
            savedReelsList.innerHTML = `<div class="empty-state-message error-message">Gagal memuat reels tersimpan: ${error.message}</div>`;
            console.error(error);
        }
    }
};

const loadAnalyticsPage = async (userId) => {
    if (analyticsReelsList) {
        showLoadingAnimation(analyticsReelsList, "Memuat data analitik...");
        try {
            const reels = await getReelPosts(null, userId);
            hideLoadingAnimation(analyticsReelsList);
            if (reels.length === 0) {
                analyticsReelsList.innerHTML = `<div class="empty-state-message">Anda belum mengunggah reels.</div>`;
            } else {
                reels.sort((a, b) => (b.views || 0) - (a.views || 0)); // Sort by views descending
                renderReels(analyticsReelsList, reels, false, true); // Don't show save button, show analytics
            }
        } catch (error) {
            hideLoadingAnimation(analyticsReelsList);
            analyticsReelsList.innerHTML = `<div class="empty-state-message error-message">Gagal memuat analitik: ${error.message}</div>`;
            console.error(error);
        }
    }
};

/**
 * Handles the logic for the watch-reel.html page.
 */
const loadWatchReelPage = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const reelId = urlParams.get('id');

    // Get DOM elements for watch page
    const watchPageContainer = document.getElementById('reel-detail-container'); // Main container for reel details
    const watchVideoElement = document.getElementById('watch-reel-video');
    const watchTitleElement = document.getElementById('watch-reel-title');
    const watchUploaderElement = document.getElementById('watch-reel-uploader');
    const watchDescriptionElement = document.getElementById('watch-reel-description');
    const watchViewsElement = document.getElementById('watch-reel-views');
    const watchLikesElement = document.getElementById('watch-reel-likes'); // Assuming you want to display likes
    const watchSaveButton = document.getElementById('watch-reel-save-btn');
    const watchAffiliateButton = document.getElementById('watch-reel-affiliate-btn');
    const commentsListElement = document.getElementById('comments-list');
    const commentForm = document.getElementById('comment-form');
    const commentInput = document.getElementById('comment-input');
    const generalStatusMessageElement = document.getElementById('general-status-message');


    if (!reelId) {
        showStatusMessage(generalStatusMessageElement, "ID reel tidak ditemukan. Mengarahkan ke beranda.", false);
        setTimeout(() => { window.location.href = "homepage.html"; }, 2000);
        return;
    }

    // Clear existing content and show loading
    if (watchPageContainer) showLoadingAnimation(watchPageContainer, "Memuat detail reel...");

    try {
        const reelDocRef = doc(db, "reels", reelId);
        const reelDocSnap = await getDoc(reelDocRef);

        if (!watchPageContainer) {
            console.error("Watch reel container not found. Cannot display reel.");
            return;
        }
        hideLoadingAnimation(watchPageContainer); // Hide loading animation once data is fetched

        if (reelDocSnap.exists()) {
            const reelData = { id: reelDocSnap.id, ...reelDocSnap.data() };

            if (watchVideoElement) {
                watchVideoElement.src = reelData.videoUrl;
                // Add event listeners for debugging video playback
                watchVideoElement.addEventListener('ended', () => {
                    console.log('Video finished playing.');
                });
                watchVideoElement.addEventListener('error', (e) => {
                    console.error('Video playback error:', e);
                    showStatusMessage(generalStatusMessageElement, "Gagal memutar video. Mungkin format tidak didukung atau video rusak.", false);
                });
                watchVideoElement.addEventListener('stalled', () => {
                    console.log('Video stalled (buffering issue).');
                });
            }
            if (watchTitleElement) watchTitleElement.textContent = reelData.title;
            if (watchUploaderElement) watchUploaderElement.textContent = reelData.userName || 'Anonim'; // Updated to directly set text for span
            if (watchDescriptionElement) watchDescriptionElement.textContent = reelData.description || 'Tidak ada deskripsi.';
            if (watchViewsElement) watchViewsElement.innerHTML = `<i class="fas fa-eye"></i> ${reelData.views || 0} Views`; // Use innerHTML for icon
            if (watchLikesElement) watchLikesElement.innerHTML = `<i class="fas fa-heart"></i> 0 Likes`; // Use innerHTML for icon

            incrementReelView(reelId); // Increment view count every time page loads

            // --- Save Button Logic ---
            if (watchSaveButton) {
                if (currentUser) {
                    const isReelSaved = savedReelIds.has(reelId); // Use global savedReelIds
                    watchSaveButton.dataset.reelId = reelId;
                    watchSaveButton.dataset.isSaved = isReelSaved;
                    watchSaveButton.querySelector('i').className = isReelSaved ? 'fas fa-bookmark' : 'far fa-bookmark';
                    const saveButtonTextNode = Array.from(watchSaveButton.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '');
                    if (saveButtonTextNode) {
                        saveButtonTextNode.textContent = isReelSaved ? ' Tersimpan' : ' Simpan';
                    }
                    if (isReelSaved) {
                        watchSaveButton.classList.add('saved');
                    } else {
                        watchSaveButton.classList.remove('saved');
                    }
                    watchSaveButton.style.display = 'inline-flex';

                    watchSaveButton.onclick = async () => { // Use onclick for simplicity here, or proper event listener
                        if (!currentUser) return; // Should be handled by initial check but good to re-check
                        const isCurrentlySaved = watchSaveButton.dataset.isSaved === 'true';
                        try {
                            await toggleSaveReel(currentUser.uid, reelId, isCurrentlySaved);
                            // Update UI immediately
                            watchSaveButton.dataset.isSaved = !isCurrentlySaved;
                            watchSaveButton.querySelector('i').className = !isCurrentlySaved ? 'fas fa-bookmark' : 'far fa-bookmark';
                            if (saveButtonTextNode) {
                                saveButtonTextNode.textContent = !isCurrentlySaved ? ' Tersimpan' : ' Simpan';
                            }
                            if (!isCurrentlySaved) {
                                watchSaveButton.classList.add('saved');
                                showStatusMessage(generalStatusMessageElement, "Reel berhasil disimpan!", true);
                            } else {
                                watchSaveButton.classList.remove('saved');
                                showStatusMessage(generalStatusMessageElement, "Reel dihapus dari tersimpan.", true);
                            }
                            // Re-fetch saved reel IDs to keep global state updated
                            savedReelIds = await getSavedReelIds(currentUser.uid);
                        } catch (error) {
                            console.error("Gagal mengubah status simpan:", error);
                            showStatusMessage(generalStatusMessageElement, "Gagal mengubah status simpan.");
                        }
                    };

                } else {
                    watchSaveButton.style.display = 'none'; // Hide if not logged in
                }
            }

            // --- Affiliate/Action Button Logic ---
            if (watchAffiliateButton) {
                if (reelData.contentType === 'halaman') {
                    watchAffiliateButton.textContent = `Lihat Halaman ${reelData.category || ''}`;
                    watchAffiliateButton.dataset.actionType = 'page';
                    watchAffiliateButton.dataset.pageName = reelData.pageName;
                    watchAffiliateButton.dataset.category = reelData.category;
                    watchAffiliateButton.style.display = 'inline-flex';
                    watchAffiliateButton.classList.remove('reel-card__overlay-btn--affiliate'); // Ensure correct styling
                    watchAffiliateButton.classList.add('page-btn'); // Add a specific class if needed
                } else if (reelData.contentType === 'link') {
                    watchAffiliateButton.textContent = `Kunjungi Tautan`;
                    watchAffiliateButton.dataset.actionType = 'link';
                    watchAffiliateButton.dataset.externalLink = reelData.externalLink;
                    watchAffiliateButton.classList.add('reel-card__overlay-btn--affiliate');
                    watchAffiliateButton.style.display = 'inline-flex';
                } else {
                    watchAffiliateButton.style.display = 'none'; // Hide if content type is just 'video'
                }

                watchAffiliateButton.onclick = () => { // Using onclick for simplicity
                    const actionType = watchAffiliateButton.dataset.actionType;
                    incrementLinkClick(reelId); // Increment click count

                    if (actionType === 'page') {
                        const pageName = watchAffiliateButton.dataset.pageName;
                        const category = watchAffiliateButton.dataset.category;
                        alert(`Mengarahkan ke halaman internal: ${pageName} (Kategori: ${category})`);
                        console.log(`Navigating to internal page: ${pageName}, Category: ${category}`);
                        // Implement actual navigation to your internal page here
                    } else if (actionType === 'link') {
                        const externalLink = watchAffiliateButton.dataset.externalLink;
                        // alert(`Membuka tautan eksternal: ${externalLink}`); // For debugging
                        console.log(`Opening external link: ${externalLink}`);
                        window.open(externalLink, '_blank'); // Open in new tab
                    }
                };
            }

            // --- Comments Logic ---
            const commentsSubCollectionRef = collection(db, "reels", reelId, "comments");

            const loadComments = async () => {
                if (!commentsListElement) return;
                commentsListElement.innerHTML = `<div class="empty-state-message">Memuat komentar...</div>`; // Initial loading text
                try {
                    const qComments = query(commentsSubCollectionRef, orderBy("createdAt", "asc"));
                    const querySnapshot = await getDocs(qComments);
                    commentsListElement.innerHTML = ''; // Clear previous comments
                    if (querySnapshot.empty) {
                        commentsListElement.innerHTML = `<div class="empty-state-message">Belum ada komentar. Jadilah yang pertama!</div>`;
                    } else {
                        querySnapshot.forEach(doc => {
                            const comment = doc.data();
                            const createdAt = comment.createdAt ? new Date(comment.createdAt.seconds * 1000).toLocaleString() : 'Sekarang';
                            const commentItem = document.createElement('div');
                            commentItem.classList.add('comment-item');
                            commentItem.innerHTML = `
                                <img src="https://via.placeholder.com/35x35" alt="User Pic" class="comment-item__pic">
                                <div class="comment-item__content">
                                    <span class="comment-item__author">${comment.userName || 'Anonim'}</span>
                                    <p class="comment-item__text">${comment.text}</p>
                                    <span class="comment-item__timestamp">${createdAt}</span>
                                </div>
                            `;
                            commentsListElement.appendChild(commentItem);
                        });
                        commentsListElement.scrollTop = commentsListElement.scrollHeight; // Scroll to bottom
                    }
                } catch (error) {
                    console.error("Error loading comments:", error);
                    commentsListElement.innerHTML = `<div class="empty-state-message error-message">Gagal memuat komentar.</div>`;
                }
            };

            if (commentsListElement) {
                loadComments(); // Load comments on page load
            }

            if (commentForm && commentInput) {
                if (currentUser) {
                    commentInput.placeholder = "Tambahkan komentar...";
                    commentInput.disabled = false;
                    commentForm.querySelector('button[type="submit"]').disabled = false;

                    commentForm.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const commentText = commentInput.value.trim();
                        if (commentText === "") {
                            showStatusMessage(generalStatusMessageElement, "Komentar tidak boleh kosong.");
                            return;
                        }
                        try {
                            await addDoc(commentsSubCollectionRef, {
                                userId: currentUser.uid,
                                userName: currentUser.email, // Or currentUser.displayName if available
                                text: commentText,
                                createdAt: serverTimestamp()
                            });
                            commentInput.value = '';
                            showStatusMessage(generalStatusMessageElement, "Komentar berhasil ditambahkan!", true);
                            await loadComments(); // Reload comments after adding new one
                        } catch (error) {
                            console.error("Error adding comment:", error);
                            showStatusMessage(generalStatusMessageElement, "Gagal menambahkan komentar.");
                        }
                    });
                } else {
                    commentInput.placeholder = "Login untuk berkomentar...";
                    commentInput.disabled = true;
                    commentForm.querySelector('button[type="submit"]').disabled = true;
                }
            }


        } else {
            // Reel document does not exist
            showStatusMessage(generalStatusMessageElement, "Reel tidak ditemukan. Mengarahkan ke beranda.", false);
            if (watchPageContainer) watchPageContainer.innerHTML = `<div class="empty-state-message">Reel tidak ditemukan.</div>`;
            setTimeout(() => { window.location.href = "homepage.html"; }, 2000);
        }
    } catch (error) {
        hideLoadingAnimation(watchPageContainer);
        console.error("Error loading reel details:", error);
        showStatusMessage(generalStatusMessageElement, `Gagal memuat detail reel: ${error.message}`, false);
        if (watchPageContainer) watchPageContainer.innerHTML = `<div class="empty-state-message error-message">Gagal memuat konten.</div>`;
        setTimeout(() => { window.location.href = "homepage.html"; }, 3000);
    }
};


// --- DOM Event Listeners & Page-Specific Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const splashScreen = document.getElementById('splash-screen');
    const isSplashPage = window.location.pathname.includes('splash.html');

    // Get the general status message element, assume it exists on most pages
    const mainStatusMessageElement = document.getElementById('general-status-message');


    // --- Splash Page Logic (splash.html) ---
    if (isSplashPage && splashScreen) {
        const logoElement = splashScreen.querySelector('.logo-animation');

        applySplittingAnimation(logoElement);

        setTimeout(() => {
            logoElement.classList.add('auto-animate');
        }, 500);

        const animationSequenceDuration = 4.7; // Duration of initial animation

        setTimeout(() => {
            clearAllAnimations(logoElement);
            logoElement.classList.add('reset-animation'); // Trigger reset/shrink animation
        }, animationSequenceDuration * 1000);

        const resetAnimationDuration = 0.5 + (0.03 * 6); // Approx duration of reset animation
        const totalSplashTime = animationSequenceDuration + resetAnimationDuration + 0.5; // Total time before redirect

        setTimeout(() => {
            splashScreen.classList.add('fade-out');
            splashScreen.addEventListener('transitionend', () => {
                splashScreen.remove();
                // Redirect based on auth state after splash
                observeAuthState(user => {
                    if (user) {
                        window.location.href = "homepage.html";
                    } else {
                        window.location.href = "login.html";
                    }
                });
            }, { once: true });
        }, totalSplashTime * 1000);

    } else {
        // --- Common elements for authenticated pages (Sidebar, Navbar, Logout, User Display) ---
        const userDisplayName = document.getElementById("user-display-name");
        const logoutBtn = document.getElementById("logout-btn");
        const uploadReelBtn = document.getElementById("upload-reel-btn"); // Assuming this button exists on some pages

        // Handle logout button click
        if (logoutBtn) {
            logoutBtn.addEventListener("click", async () => {
                try {
                    await logoutUser();
                    window.location.href = "login.html";
                } catch (error) {
                    console.error("Error logging out:", error);
                    showStatusMessage(mainStatusMessageElement, "Gagal logout. Silakan coba lagi.");
                }
            });
        }

        // Handle navigation for "Unggah Reel" button
        if (uploadReelBtn) {
            uploadReelBtn.addEventListener('click', () => {
                window.location.href = 'upload.html'; // Navigate to upload page
            });
        }

        // Handle sidebar navigation links (update active class and navigate)
        const sidebarNavLinks = document.querySelectorAll('.main-nav a');
        sidebarNavLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                // Remove active from all links
                sidebarNavLinks.forEach(l => l.classList.remove('active'));
                // Add active to clicked link
                e.currentTarget.classList.add('active');
                // Navigate
                const targetPage = e.currentTarget.getAttribute('href');
                if (targetPage && targetPage !== '#') { // Prevent navigating to '#'
                    e.preventDefault(); // Prevent default link behavior if we handle navigation
                    window.location.href = targetPage;
                }
            });
            // Set active link based on current path
            if (link.getAttribute('href') && window.location.pathname.includes(link.getAttribute('href'))) {
                link.classList.add('active');
            }
        });

        // Handle mobile navigation links (update active class and navigate)
        const mobileNavLinks = document.querySelectorAll('.mobile-nav-list a');
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                mobileNavLinks.forEach(l => l.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const targetPage = e.currentTarget.getAttribute('href');
                if (targetPage && targetPage !== '#') {
                    e.preventDefault();
                    window.location.href = targetPage;
                }
            });
            // Set active link based on current path
            if (link.getAttribute('href') && window.location.pathname.includes(link.getAttribute('href'))) {
                link.classList.add('active');
            }
        });


        // --- Login Page Logic (login.html) ---
        const loginBtn = document.getElementById("login-btn");
        if (loginBtn) {
            const loginEmailInput = document.getElementById("login-email");
            const loginPasswordInput = document.getElementById("login-password");
            const loginAuthStatus = document.getElementById("auth-status"); // Page-specific status

            loginBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                const email = loginEmailInput.value;
                const password = loginPasswordInput.value;
                if (!email || !password) {
                    showStatusMessage(loginAuthStatus, "Email dan password tidak boleh kosong.");
                    return;
                }
                try {
                    await loginUser(email, password);
                    showStatusMessage(loginAuthStatus, "Login berhasil!", true);
                    setTimeout(() => { window.location.href = "homepage.html"; }, 1000);
                } catch (error) {
                    let errorMessage = "Login gagal. Silakan coba lagi.";
                    if (error.code === 'auth/invalid-email') {
                        errorMessage = "Format email tidak valid.";
                    } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                        errorMessage = "Email atau password salah.";
                    } else if (error.code === 'auth/too-many-requests') {
                        errorMessage = "Terlalu banyak percobaan login. Coba lagi nanti.";
                    }
                    showStatusMessage(loginAuthStatus, errorMessage);
                }
            });
        }

        // --- Register Page Logic (register.html) ---
        const signupBtn = document.getElementById("signup-btn");
        if (signupBtn) {
            const signupEmailInput = document.getElementById("signup-email");
            const signupPasswordInput = document.getElementById("signup-password");
            const signupConfirmPasswordInput = document.getElementById("signup-confirm-password");
            const signupAuthStatus = document.getElementById("auth-status"); // Page-specific status

            signupBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                const email = signupEmailInput.value;
                const password = signupPasswordInput.value;
                const confirmPassword = signupConfirmPasswordInput.value;
                if (!email || !password || !confirmPassword) {
                    showStatusMessage(signupAuthStatus, "Semua kolom harus diisi.");
                    return;
                }
                if (password.length < 6) {
                    showStatusMessage(signupAuthStatus, "Password minimal 6 karakter.");
                    return;
                }
                if (password !== confirmPassword) {
                    showStatusMessage(signupAuthStatus, "Konfirmasi password tidak cocok.");
                    return;
                }
                try {
                    await registerUser(email, password);
                    showStatusMessage(signupAuthStatus, "Pendaftaran berhasil! Silakan login.", true);
                    setTimeout(() => { window.location.href = "login.html"; }, 1500);
                } catch (error) {
                    let errorMessage = "Pendaftaran gagal. Silakan coba lagi.";
                    if (error.code === 'auth/email-already-in-use') {
                        errorMessage = "Email sudah terdaftar.";
                    } else if (error.code === 'auth/invalid-email') {
                        errorMessage = "Format email tidak valid.";
                    } else if (error.code === 'auth/weak-password') {
                        errorMessage = "Password terlalu lemah.";
                    }
                    showStatusMessage(signupAuthStatus, errorMessage);
                }
            });
        }

        // --- Upload Page Logic (upload.html) ---
        const postReelBtn = document.getElementById("post-reel-btn");
        if (postReelBtn) {
            const reelTitleInput = document.getElementById("reel-title");
            const reelDescriptionInput = document.getElementById("reel-description");
            const videoUploadInput = document.getElementById("video-upload");
            const videoFileNameDisplay = document.getElementById("video-file-name");
            const contentTypeSelect = document.getElementById("content-type");
            const pageDetailsDiv = document.getElementById("page-details");
            const pageNameInput = document.getElementById("page-name");
            const categorySelect = document.getElementById("category");
            const linkDetailsDiv = document.getElementById("link-details");
            const externalLinkInput = document.getElementById("external-link");
            const uploadStatus = document.getElementById("upload-status"); // Page-specific status

            if (videoUploadInput && videoFileNameDisplay) {
                videoUploadInput.addEventListener('change', () => {
                    videoFileNameDisplay.textContent = videoUploadInput.files.length > 0 ? videoUploadInput.files[0].name : '';
                });
            }

            if (contentTypeSelect) {
                contentTypeSelect.addEventListener('change', () => {
                    const selectedType = contentTypeSelect.value;
                    if (pageDetailsDiv) pageDetailsDiv.style.display = 'none';
                    if (linkDetailsDiv) linkDetailsDiv.style.display = 'none';

                    // Remove 'required' from all conditional inputs first
                    if (pageNameInput) pageNameInput.removeAttribute('required');
                    if (categorySelect) categorySelect.removeAttribute('required');
                    if (externalLinkInput) externalLinkInput.removeAttribute('required');

                    // Apply 'required' and show/hide based on selection
                    if (selectedType === 'halaman') {
                        if (pageDetailsDiv) pageDetailsDiv.style.display = 'block';
                        if (pageNameInput) pageNameInput.setAttribute('required', 'required');
                        if (categorySelect) categorySelect.setAttribute('required', 'required');
                    } else if (selectedType === 'link') {
                        if (linkDetailsDiv) linkDetailsDiv.style.display = 'block';
                        if (externalLinkInput) externalLinkInput.setAttribute('required', 'required');
                    }
                });
                contentTypeSelect.dispatchEvent(new Event('change')); // Trigger on load
            }

            postReelBtn.addEventListener("click", async () => {
                if (!currentUser) {
                    showStatusMessage(uploadStatus, "Anda harus login untuk memposting reel.");
                    return;
                }
                const title = reelTitleInput.value;
                const description = reelDescriptionInput.value;
                const videoFile = videoUploadInput.files[0];
                const contentType = contentTypeSelect.value;
                let pageName = null;
                let category = null;
                let externalLink = null;

                if (!title || !videoFile || !contentType) {
                    showStatusMessage(uploadStatus, "Judul, video, dan tipe konten tidak boleh kosong.");
                    return;
                }

                if (contentType === 'halaman') {
                    pageName = pageNameInput.value;
                    category = categorySelect.value;
                    if (!pageName || !category) {
                        showStatusMessage(uploadStatus, "Nama halaman dan kategori harus diisi.");
                        return;
                    }
                } else if (contentType === 'link') {
                    externalLink = externalLinkInput.value;
                    if (!externalLink) {
                        showStatusMessage(uploadStatus, "Tautan eksternal harus diisi.");
                        return;
                    }
                    try {
                        new URL(externalLink); // Validate URL format
                    } catch (_) {
                        showStatusMessage(uploadStatus, "Format tautan eksternal tidak valid.");
                        return;
                    }
                }

                // Show loading animation for the upload process
                showLoadingAnimation(document.body, "Mengunggah video dan memposting reel...");

                postReelBtn.disabled = true; // Disable button during upload
                try {
                    const uploadResult = await uploadVideoToCloudinary(videoFile);
                    const videoUrl = uploadResult.secure_url;
                    const publicId = uploadResult.public_id;
                    const thumbnailUrl = `https://res.cloudinary.com/${uploadResult.cloud_name}/video/upload/q_auto:good,f_auto,w_400,h_300,c_fill/v${uploadResult.version}/${publicId}.jpg`;


                    await addReelPost(currentUser.uid, currentUser.email, title, description, videoUrl, thumbnailUrl, publicId, contentType, pageName, category, externalLink);

                    hideLoadingAnimation(document.body);
                    showStatusMessage(uploadStatus, "Reel berhasil diposting!", true);
                    // Clear form fields
                    reelTitleInput.value = "";
                    reelDescriptionInput.value = "";
                    videoUploadInput.value = "";
                    if (videoFileNameDisplay) videoFileNameDisplay.textContent = '';
                    if (contentTypeSelect) contentTypeSelect.value = "video"; // Reset to default
                    if (pageDetailsDiv) pageDetailsDiv.style.display = 'none';
                    if (linkDetailsDiv) linkDetailsDiv.style.display = 'none';
                    if (pageNameInput) pageNameInput.value = "";
                    if (categorySelect) categorySelect.value = "";
                    if (externalLinkInput) externalLinkInput.value = "";

                    setTimeout(() => {
                        window.location.href = 'homepage.html'; // Redirect after success
                    }, 1500);

                } catch (error) {
                    hideLoadingAnimation(document.body);
                    showStatusMessage(uploadStatus, `Gagal memposting reel: ${error.message}`);
                    console.error("Upload/Post error:", error);
                } finally {
                    postReelBtn.disabled = false; // Re-enable button
                }
            });
        }

        // --- Explore Page Category Filter Logic (explore.html) ---
        const filterButtons = document.querySelectorAll('.category-filter .filter-btn');
        if (filterButtons.length > 0) {
            filterButtons.forEach(button => {
                button.addEventListener('click', (event) => {
                    filterButtons.forEach(btn => btn.classList.remove('active'));
                    event.currentTarget.classList.add('active');

                    const selectedCategory = event.currentTarget.dataset.category;
                    loadExplorePageReels(selectedCategory);
                });
            });
        }


        // --- Auth state observer to manage user state and load content ---
        observeAuthState(async (user) => {
            if (user) {
                currentUser = user;
                if (userDisplayName) {
                    userDisplayName.textContent = user.email; // Display user email
                }
                // Fetch saved reel IDs once user is logged in
                savedReelIds = await getSavedReelIds(currentUser.uid);

                // Load content based on current page
                if (window.location.pathname.includes('homepage.html') || window.location.pathname === '/') {
                    loadHomePageReels();
                } else if (window.location.pathname.includes('explore.html')) {
                    const activeFilterButton = document.querySelector('.category-filter .filter-btn.active');
                    const initialCategory = activeFilterButton ? activeFilterButton.dataset.category : 'all';
                    loadExplorePageReels(initialCategory);
                } else if (window.location.pathname.includes('my-reels.html')) {
                    loadMyReelsPage(currentUser.uid);
                } else if (window.location.pathname.includes('saved-reels.html')) {
                    loadSavedReelsPage(currentUser.uid);
                } else if (window.location.pathname.includes('analytics.html')) {
                    loadAnalyticsPage(currentUser.uid);
                } else if (window.location.pathname.includes('watch-reel.html')) {
                    loadWatchReelPage(); // Call watch reel specific loading
                }
            } else {
                currentUser = null;
                savedReelIds = new Set(); // Clear saved IDs if user logs out
                // Redirect if not on login, register, or splash page
                if (!window.location.pathname.includes('login.html') && !window.location.pathname.includes('register.html') && !window.location.pathname.includes('splash.html')) {
                    window.location.href = "login.html";
                }
                // Clear all reels lists and set empty states if user logs out
                if (reelsList) { reelsList.innerHTML = `<div class="empty-state-message">Silakan login untuk melihat reels.</div>`; }
                if (exploreReelsList) { exploreReelsList.innerHTML = `<div class="empty-state-message">Silakan login untuk menjelajahi reels.</div>`; }
                if (myReelsList) { myReelsList.innerHTML = `<div class="empty-state-message">Silakan login untuk melihat reels Anda.</div>`; }
                if (savedReelsList) { savedReelsList.innerHTML = `<div class="empty-state-message">Silakan login untuk melihat reels tersimpan.</div>`; }
                if (analyticsReelsList) { analyticsReelsList.innerHTML = `<div class="empty-state-message">Silakan login untuk melihat analitik.</div>`; }

                // For watch-reel.html, if user is not logged in
                const currentPath = window.location.pathname;
                if (currentPath.includes('watch-reel.html')) {
                    const watchPageContainer = document.getElementById('reel-detail-container');
                    if (watchPageContainer) {
                        watchPageContainer.innerHTML = `<div class="empty-state-message">Silakan login untuk melihat detail reel ini.</div>`;
                    }
                    const commentsListElement = document.getElementById('comments-list');
                    if (commentsListElement) {
                        commentsListElement.innerHTML = `<div class="empty-state-message">Login untuk melihat komentar.</div>`;
                    }
                    const commentInput = document.getElementById('comment-input');
                    const commentFormBtn = document.querySelector('#comment-form button[type="submit"]');
                    if (commentInput) commentInput.placeholder = "Login untuk berkomentar...";
                    if (commentInput) commentInput.disabled = true;
                    if (commentFormBtn) commentFormBtn.disabled = true;

                    const watchSaveButton = document.getElementById('watch-reel-save-btn');
                    const watchAffiliateButton = document.getElementById('watch-reel-affiliate-btn');
                    if(watchSaveButton) watchSaveButton.style.display = 'none';
                    if(watchAffiliateButton) watchAffiliateButton.style.display = 'none';
                }
            }
        });
    }
});

