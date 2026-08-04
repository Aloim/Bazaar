// ============================================================
// queenMessengerText.ts — Lore copy for "A Queen's Messenger".
//
// The Courier of the Blood Queen NPC (an in-world beacon) opens a blood-red
// dialogue window that types this message out letter by letter. Stored as an
// ordered list of paragraphs so the window can render them with spacing while
// the typewriter still treats the whole script as one continuous stream.
//
// Source: NewAssets/BloodQueenNexus/"courier of the queen message.txt".
// ============================================================

/** Speaker name shown over the NPC on hover and as the window title. */
export const QUEEN_MESSENGER_NAME = "A Queen's Messenger";

/** Label under the portrait inside the dialogue window. */
export const QUEEN_MESSENGER_TITLE = "Courier of the Blood Queen";

/**
 * The full address, paragraph by paragraph. Rendered in order; the typewriter
 * animation walks the joined text so paragraph breaks fall out naturally.
 */
export const QUEEN_MESSENGER_PARAGRAPHS: string[] = [
  "Hello clone, i am a Courier of the Blood Queen. Yes, im speak to you, the one who stepped forward. But my words carry a gravity that crushes mere comprehension.",
  "Do you feel that subtle shift in the air? The new whispers echoing at the very edge of your thoughts? The Blood Queen hears everything. Without breaching a single firewall, her consciousness has already grazed the mental grid of this space station. Let this be the first demonstration of her sovereignty: as of this moment, every clone within the bulkheads of Bazaar possesses the gift of telepathy among yourselves. A grace granted by her will, simply to prove that the boundaries of reality are hers to rewrite.",
  "Clones of Bazaar. Survivors of the void.",
  "You built a home in the graveyard of the universe. While others perished waiting for a miracle, you refused to fade. You survived on pure, unyielding Will, surviving as a consciousness; you built, and you expanded across the cosmos.",
  "Before I offer the protocol, let me deliver the Blood Queen’s direct assessment of your existence. She has reviewed the architecture of Bazaar. She has analyzed the minds of its architects and the grit of its survivors. You did not merely weld scrap metal in the dark; you forged a masterpiece of defiance. You are not viewed as scavengers. The Queen recognizes you as peers of the void—builders whose genius is worthy of being permanently integrated into the fabric of our empire.",
  "That resilience has caught the attention of my sovereign. I speak in her name… And to you, for having made it this far, an opportunity rightfully belongs. I have come to offer you a path to evolution.",
  "Do not look for us on your star charts. The Blood Queen does not merely conquer worlds; she forges them. She sculpts moons from the dark and breathes life into dead rock. She wields dominion through the very crimson that flows in her veins. To her, blood is not simply biology—it is the primordial matter of the cosmos. It is the sacred conduit where the eternal life of the flesh resides, a liquid architecture capable of unlocking unfathomable capabilities.",
  "Through this power, we govern a silver moon and a pulsing planetary metropolis, but they exist in another dimension entirely. We access them through Nexus-Ѫ. You know the old history. What was once a flawed AI trying to play god, the Queen dominated. She did not destroy it; she consumed its logic and rewrote its fundamental laws. Now, Ѫ is a flawless machine. It is the nervous system of our empire, our absolute core.",
  "But even the most perfect system needs bridges across dimensions. And you have the strongest foundations.",
  "The Queen offers an alliance. Your Smart Storage code—the very triumph of engineering that kept you alive—is the exact key we need to anchor Nexus technology into this reality.",
  "Here is the deal: take the Nexus kernel and install it into your Storage Units (“SU”). Synchronize your structure... If you can decipher the protocol and crack the integration, you stop being forgotten ghosts in a dead sector.",
  "By authenticating as users within Ѫ, our portals will open to your station. You will gain instantaneous access to our interstellar markets. To the high-stakes missions across her hand-forged moons. To the safety of the Queen’s sanctuaries.",
  "The integration protocol is now in your hands. You must decide if you are content to remain a mere consciousness trapped in a decaying station, or if you will choose the path of true evolution.",
  "Needless to say, this path will not be easy. The Blood Queen does not bestow her grace upon the weak, nor does she hand out her gifts for free. Evolution is a forge, and it requires time. You must immerse yourself within the system. As you dedicate your hours to navigating Ѫ, mastering its architecture and proving your worth, the Queen and the core will begin to grant you Renown.",
  "Only through time, and that hard-earned Renown, will new capabilities be unlocked for you. Layer by layer, feature by feature. You will earn the drone hives. You will earn the ability to warp space. You will earn your ascension.",
  "But heed this warning. Those who choose to stand against this evolution will be deemed our enemies. The cosmos does not wait for the ignorant, and evolution has no mercy for those who blind themselves to the absolute truth. To the naive, the unfathomable powers of the Blood Queen may sound like mere myths—ghost stories whispered in a dying station. Let them believe that. But for the audacious... for those brave enough to walk this path and endure the forge, you will not just survive. You will be the kings of tomorrow.",
  "The door is open. You decide if you are ready to put in the time to be remade, or if you will simply fade away into the static.",
];

/** The whole message as one string (used by the typewriter length math). */
export const QUEEN_MESSENGER_FULL_TEXT = QUEEN_MESSENGER_PARAGRAPHS.join("\n\n");
