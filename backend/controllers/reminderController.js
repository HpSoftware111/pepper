import Reminder from '../models/Reminder.js';

/**
 * Get all reminders for the authenticated user
 * GET /api/reminders
 */
export async function getReminders(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { completed, upcoming } = req.query;

    // Build query
    const query = { userId };

    // Filter by completion status if provided
    if (completed !== undefined) {
      query.completed = completed === 'true';
    }

    // If upcoming is true, only get reminders that are not completed and due date is in the future
    if (upcoming === 'true') {
      query.completed = false;
      query.due = { $gte: new Date() };
    }

    const reminders = await Reminder.find(query)
      .sort({ due: 1 }) // Sort by due date ascending
      .lean();

    // Transform _id to id for frontend consistency
    const transformedReminders = reminders.map((reminder) => ({
      ...reminder,
      id: reminder._id.toString(),
      _id: undefined,
    }));

    return res.json({ reminders: transformedReminders });
  } catch (error) {
    console.error('Error fetching reminders:', error);
    return res.status(500).json({ error: 'Failed to fetch reminders' });
  }
}

/**
 * Get a single reminder by ID
 * GET /api/reminders/:id
 */
export async function getReminder(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    const reminder = await Reminder.findOne({ _id: id, userId }).lean();

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    // Transform _id to id for frontend consistency
    const transformedReminder = {
      ...reminder,
      id: reminder._id.toString(),
      _id: undefined,
    };

    return res.json({ reminder: transformedReminder });
  } catch (error) {
    console.error('Error fetching reminder:', error);
    return res.status(500).json({ error: 'Failed to fetch reminder' });
  }
}

/**
 * Create a new reminder
 * POST /api/reminders
 */
export async function createReminder(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { title, due, owner } = req.body;

    // Validation
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (!due) {
      return res.status(400).json({ error: 'Due date is required' });
    }

    // Parse due date
    const dueDate = new Date(due);
    if (Number.isNaN(dueDate.getTime())) {
      return res.status(400).json({ error: 'Invalid due date format' });
    }

    // Create reminder
    const reminder = new Reminder({
      userId,
      title: title.trim(),
      due: dueDate,
      owner: owner?.trim() || 'Pepper reminder',
      completed: false,
    });

    await reminder.save();

    // Transform _id to id for frontend consistency
    const reminderObj = reminder.toObject();
    const transformedReminder = {
      ...reminderObj,
      id: reminderObj._id.toString(),
      _id: undefined,
    };

    return res.status(201).json({ reminder: transformedReminder });
  } catch (error) {
    console.error('Error creating reminder:', error);
    return res.status(500).json({ error: 'Failed to create reminder' });
  }
}

/**
 * Update a reminder
 * PUT /api/reminders/:id
 */
export async function updateReminder(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;
    const { title, due, owner, completed } = req.body;

    // Find reminder
    const reminder = await Reminder.findOne({ _id: id, userId });

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    // Update fields
    if (title !== undefined) {
      reminder.title = title.trim();
    }

    if (due !== undefined) {
      const dueDate = new Date(due);
      if (Number.isNaN(dueDate.getTime())) {
        return res.status(400).json({ error: 'Invalid due date format' });
      }
      reminder.due = dueDate;
    }

    if (owner !== undefined) {
      reminder.owner = owner.trim();
    }

    if (completed !== undefined) {
      reminder.completed = completed;
      if (completed && !reminder.completedAt) {
        reminder.completedAt = new Date();
      } else if (!completed) {
        reminder.completedAt = null;
      }
    }

    await reminder.save();

    // Transform _id to id for frontend consistency
    const reminderObj = reminder.toObject();
    const transformedReminder = {
      ...reminderObj,
      id: reminderObj._id.toString(),
      _id: undefined,
    };

    return res.json({ reminder: transformedReminder });
  } catch (error) {
    console.error('Error updating reminder:', error);
    return res.status(500).json({ error: 'Failed to update reminder' });
  }
}

/**
 * Delete a reminder
 * DELETE /api/reminders/:id
 */
export async function deleteReminder(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    const reminder = await Reminder.findOneAndDelete({ _id: id, userId });

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    return res.json({ message: 'Reminder deleted successfully' });
  } catch (error) {
    console.error('Error deleting reminder:', error);
    return res.status(500).json({ error: 'Failed to delete reminder' });
  }
}

/**
 * Mark reminder as completed
 * POST /api/reminders/:id/complete
 */
export async function completeReminder(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    const reminder = await Reminder.findOne({ _id: id, userId });

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    reminder.completed = true;
    reminder.completedAt = new Date();

    await reminder.save();

    // Transform _id to id for frontend consistency
    const reminderObj = reminder.toObject();
    const transformedReminder = {
      ...reminderObj,
      id: reminderObj._id.toString(),
      _id: undefined,
    };

    return res.json({ reminder: transformedReminder });
  } catch (error) {
    console.error('Error completing reminder:', error);
    return res.status(500).json({ error: 'Failed to complete reminder' });
  }
}

/**
 * Mark reminder as incomplete
 * POST /api/reminders/:id/uncomplete
 */
export async function uncompleteReminder(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    const reminder = await Reminder.findOne({ _id: id, userId });

    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    reminder.completed = false;
    reminder.completedAt = null;

    await reminder.save();

    // Transform _id to id for frontend consistency
    const reminderObj = reminder.toObject();
    const transformedReminder = {
      ...reminderObj,
      id: reminderObj._id.toString(),
      _id: undefined,
    };

    return res.json({ reminder: transformedReminder });
  } catch (error) {
    console.error('Error uncompleting reminder:', error);
    return res.status(500).json({ error: 'Failed to uncomplete reminder' });
  }
}

