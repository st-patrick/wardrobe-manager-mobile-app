/**
 * Classic Wardrobe View (backed up 2026-03-10)
 *
 * This file preserves the original renderWardrobeArea and renderWardrobeItemCard
 * implementations before the visual grid redesign. Kept as reference and fallback.
 *
 * The original view showed:
 * - Header with "Wardrobe Loop" title and action buttons
 * - Outfit builder card with role checklist (top/pants/shoes)
 * - Classification controls (developer mode)
 * - Category-grouped ScrollView with collapsible sections
 * - Each item as a card with photo + text details + select/delete buttons
 */

// --- renderWardrobeItemCard ---
//
// const renderWardrobeItemCard = (item: WardrobeItem) => {
//   const isDeleting = Boolean(deletingItemIds[item.id]);
//   const isSelectedForOutfit = selectedWardrobeItemSet.has(item.id);
//
//   return (
//     <View key={item.id} style={[styles.wardrobeCard, isSelectedForOutfit ? styles.wardrobeCardSelected : null]}>
//       <Pressable onPress={() => openImageViewer(item.uri)}>
//         <Image source={{ uri: item.uri }} style={styles.wardrobeImage} />
//       </Pressable>
//       <View style={styles.wardrobeBody}>
//         <Text style={styles.wardrobeTitle}>{primaryLabel(item)}</Text>
//         <Text style={styles.wardrobeLine}>Color: {colorSummary(item)}</Text>
//         <Text style={styles.wardrobeLine}>Insulation: {insulationSummary(item)}</Text>
//         <Text style={styles.wardrobeLine}>Details: {featureSummary(item)}</Text>
//         {DEVELOPER_MODE ? (
//           <>
//             <Text style={styles.wardrobeRefLine}>Ref: {referenceSummary(item)}</Text>
//             {item.classification ? (
//               <Text style={styles.wardrobeConfidence}>
//                 Confidence: {Math.round(item.classification.confidence * 100)}%
//               </Text>
//             ) : null}
//             {item.classificationError ? (
//               <Text style={styles.wardrobeError}>Last error: {item.classificationError}</Text>
//             ) : null}
//           </>
//         ) : null}
//
//         <View style={styles.wardrobeActionsRow}>
//           <Pressable
//             style={[
//               styles.selectItemButton,
//               isSelectedForOutfit ? styles.selectItemButtonActive : null,
//               isClassifying ? styles.selectItemButtonDisabled : null,
//             ]}
//             onPress={() => toggleWardrobeItemSelection(item.id)}
//             disabled={isClassifying}
//           >
//             <Text
//               style={[
//                 styles.selectItemButtonText,
//                 isSelectedForOutfit ? styles.selectItemButtonTextActive : null,
//               ]}
//             >
//               {isSelectedForOutfit ? 'Remove' : 'Select'}
//             </Text>
//           </Pressable>
//
//           <Pressable
//             style={[styles.deleteButton, isDeleting || isClassifying ? styles.deleteButtonDisabled : null]}
//             onPress={() => handleDeleteItem(item)}
//             disabled={isDeleting || isClassifying}
//           >
//             <Text style={styles.deleteButtonText}>{isDeleting ? 'Deleting...' : 'Delete'}</Text>
//           </Pressable>
//         </View>
//       </View>
//     </View>
//   );
// };

// --- renderWardrobeArea ---
//
// const renderWardrobeArea = () => (
//   <View style={styles.wardrobeContainer}>
//     <View style={styles.wardrobeHeaderRow}>
//       <View style={styles.wardrobeHeader}>
//         <Text style={styles.wardrobeHeaderTitle}>Wardrobe Loop</Text>
//         <Text style={styles.wardrobeHeaderBody}>
//           1) Add clothes 2) select pieces 3) open Try-On Studio.
//         </Text>
//       </View>
//       <View style={styles.quickActionsRow}>
//         <Pressable style={styles.quickActionButton} onPress={() => setActiveTab('camera')}>
//           <Text style={styles.quickActionButtonText}>Take Photos</Text>
//         </Pressable>
//         <Pressable
//           style={[styles.quickActionButton, isImporting ? styles.quickActionButtonDisabled : null]}
//           onPress={handleAddFromPhotos}
//           disabled={isImporting}
//         >
//           <Text style={styles.quickActionButtonText}>
//             {isImporting ? 'Importing...' : 'Import Photos'}
//           </Text>
//         </Pressable>
//       </View>
//     </View>
//
//     <View style={styles.outfitBuilderCard}>
//       <Text style={styles.outfitBuilderTitle}>Step 2: Pick Pieces</Text>
//       <Text style={styles.outfitBuilderBody}>
//         Tap Select on the pieces you want to combine. Core set: top, pants, shoes.
//       </Text>
//       <View style={styles.selectionChecklistRow}>
//         {/* ... checklist chips for top, pants, shoes ... */}
//       </View>
//       <View style={styles.outfitBuilderActions}>
//         {/* ... Preview Outfit / Clear / Try-On Studio buttons ... */}
//       </View>
//     </View>
//
//     {/* Developer-only controls: classify button, lookbook nav, etc. */}
//
//     <ScrollView contentContainerStyle={styles.wardrobeSections} showsVerticalScrollIndicator={false}>
//       {groupedCategories.length === 0 ? (
//         <View style={styles.emptyWardrobe}>
//           <Text style={styles.emptyWardrobeText}>
//             No items yet. Capture or import photos to build wardrobe.
//           </Text>
//         </View>
//       ) : (
//         groupedCategories.map((category) => {
//           const isCollapsed = collapsedCategories[category.label] ?? false;
//           return (
//             <View key={category.label} style={styles.categorySection}>
//               <Pressable
//                 style={styles.categoryHeader}
//                 onPress={() => toggleCategoryCollapsed(category.label)}
//               >
//                 <Text style={styles.categoryTitle}>
//                   {category.label} ({category.items.length})
//                 </Text>
//                 <Text style={styles.categoryChevron}>{isCollapsed ? '+' : '-'}</Text>
//               </Pressable>
//
//               {isCollapsed ? null : (
//                 <View style={styles.categoryGrid}>
//                   {category.items.map((item) => renderWardrobeItemCard(item))}
//                 </View>
//               )}
//             </View>
//           );
//         })
//       )}
//     </ScrollView>
//   </View>
// );

// --- Associated styles (for reference) ---
//
// wardrobeCard: { width: '48.5%', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', overflow: 'hidden', backgroundColor: '#0f172a', marginBottom: 10 }
// wardrobeCardSelected: { borderColor: '#22d3ee', backgroundColor: '#082f49' }
// wardrobeImage: { width: '100%', aspectRatio: 1, backgroundColor: '#020617' }
// wardrobeBody: { padding: 10 }
// wardrobeTitle: { color: '#f8fafc', fontSize: 13, fontWeight: '700', marginBottom: 6 }
// wardrobeLine: { color: '#cbd5e1', fontSize: 12, marginBottom: 4 }
// categorySection: { borderWidth: 1, borderColor: '#1e293b', borderRadius: 12, backgroundColor: '#0b1224', marginBottom: 10, overflow: 'hidden' }
// categoryHeader: { minHeight: 50, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#111a2e' }
// categoryGrid: { padding: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }

export {};
