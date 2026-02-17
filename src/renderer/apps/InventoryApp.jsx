import { useEffect, useMemo, useState } from "react";

export default function InventoryApp({ tenantId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [newItem, setNewItem] = useState({
    sku: "",
    name: "",
    description: "",
    quantityOnHand: 0,
    reorderPoint: 0,
  });
  const [adjustments, setAdjustments] = useState({});

  const lowStockCount = useMemo(
    () => items.filter((item) => item.quantity_on_hand <= item.reorder_point).length,
    [items]
  );

  async function loadItems(nextLowStockOnly = lowStockOnly) {
    setLoading(true);
    const result = await window.electronAPI.inventory.listItems({
      tenantId,
      lowStockOnly: nextLowStockOnly,
    });
    if (!result.ok) {
      setMessage(result.error || "Failed to load inventory.");
      setLoading(false);
      return;
    }
    setItems(result.data);
    setLoading(false);
  }

  useEffect(() => {
    loadItems(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function handleCreateItem(event) {
    event.preventDefault();
    setMessage("Creating item...");
    const result = await window.electronAPI.inventory.createItem({
      tenantId,
      ...newItem,
      quantityOnHand: Number(newItem.quantityOnHand || 0),
      reorderPoint: Number(newItem.reorderPoint || 0),
    });
    if (!result.ok) {
      setMessage(result.error || "Failed to create item.");
      return;
    }
    setMessage("Item created.");
    setNewItem({
      sku: "",
      name: "",
      description: "",
      quantityOnHand: 0,
      reorderPoint: 0,
    });
    await loadItems();
  }

  async function handleAdjust(itemId) {
    const state = adjustments[itemId] || { changeAmount: 0, reason: "manual-adjustment" };
    const changeAmount = Number(state.changeAmount || 0);
    if (!changeAmount) {
      setMessage("Change amount cannot be zero.");
      return;
    }

    const result = await window.electronAPI.inventory.adjustItem({
      tenantId,
      itemId,
      changeAmount,
      reason: state.reason || "manual-adjustment",
    });
    if (!result.ok) {
      setMessage(result.error || "Adjustment failed.");
      return;
    }
    setMessage("Stock updated.");
    setAdjustments((prev) => ({
      ...prev,
      [itemId]: { changeAmount: 0, reason: "manual-adjustment" },
    }));
    await loadItems();
  }

  return (
    <section className="inventory-shell">
      <header className="inventory-header">
        <h2>Inventory System</h2>
        <div className="inventory-header-right">
          <span className="chip">Low stock: {lowStockCount}</span>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={async (event) => {
                const checked = event.target.checked;
                setLowStockOnly(checked);
                await loadItems(checked);
              }}
            />
            Show only low stock
          </label>
        </div>
      </header>

      <form className="inventory-create" onSubmit={handleCreateItem}>
        <h3>Add Inventory Item</h3>
        <div className="inventory-grid">
          <input
            placeholder="SKU"
            value={newItem.sku}
            onChange={(event) => setNewItem((prev) => ({ ...prev, sku: event.target.value }))}
            required
          />
          <input
            placeholder="Name"
            value={newItem.name}
            onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <input
            placeholder="Starting Qty"
            type="number"
            min="0"
            value={newItem.quantityOnHand}
            onChange={(event) =>
              setNewItem((prev) => ({ ...prev, quantityOnHand: event.target.value }))
            }
          />
          <input
            placeholder="Reorder Point"
            type="number"
            min="0"
            value={newItem.reorderPoint}
            onChange={(event) =>
              setNewItem((prev) => ({ ...prev, reorderPoint: event.target.value }))
            }
          />
          <input
            placeholder="Description (optional)"
            value={newItem.description}
            onChange={(event) =>
              setNewItem((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </div>
        <button type="submit">Create Item</button>
      </form>

      {message ? <p className="message">{message}</p> : null}

      <div className="inventory-list">
        <h3>Items</h3>
        {loading ? <p className="subtitle">Loading items...</p> : null}
        {!loading && items.length === 0 ? <p className="subtitle">No inventory items yet.</p> : null}
        {!loading && items.length > 0 ? (
          <table className="inventory-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Qty</th>
                <th>Reorder</th>
                <th>Adjust</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const state = adjustments[item.id] || { changeAmount: 0, reason: "manual-adjustment" };
                return (
                  <tr key={item.id}>
                    <td>{item.sku}</td>
                    <td>{item.name}</td>
                    <td>{item.quantity_on_hand}</td>
                    <td>{item.reorder_point}</td>
                    <td>
                      <div className="adjust-row">
                        <input
                          type="number"
                          value={state.changeAmount}
                          onChange={(event) =>
                            setAdjustments((prev) => ({
                              ...prev,
                              [item.id]: { ...state, changeAmount: event.target.value },
                            }))
                          }
                        />
                        <input
                          placeholder="Reason"
                          value={state.reason}
                          onChange={(event) =>
                            setAdjustments((prev) => ({
                              ...prev,
                              [item.id]: { ...state, reason: event.target.value },
                            }))
                          }
                        />
                        <button type="button" onClick={() => handleAdjust(item.id)}>
                          Apply
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}
