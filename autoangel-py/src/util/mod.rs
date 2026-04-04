use pyo3::PyResult;
use pyo3::exceptions::PyIndexError;

pub trait PySignedIndex {
    type Output: ?Sized;

    fn convert_signed_index(&self, index: isize) -> PyResult<usize> {
        // Looks like a bug in O3? with negative indices not being converted to positive
        // https://github.com/PyO3/pyo3/issues/2392#issuecomment-1133952050
        let signed_len = self._len() as isize;
        let adjusted_index = if index < 0 {
            if index < -signed_len {
                return Err(PyIndexError::new_err(format!(
                    "negative index {} is out of range [{}, 0)",
                    index, -signed_len
                )));
            }
            (index + signed_len) as usize
        } else {
            if index >= signed_len {
                return Err(PyIndexError::new_err(format!(
                    "index {index} is out of range [0, {signed_len})"
                )));
            }
            index as usize
        };

        Ok(adjusted_index)
    }

    fn signed_index(&self, index: isize) -> PyResult<&Self::Output> {
        Ok(self._get(self.convert_signed_index(index)?))
    }

    fn _len(&self) -> usize;

    fn _get(&self, index: usize) -> &Self::Output;
}

impl<T> PySignedIndex for std::sync::Arc<[T]> {
    type Output = T;

    fn _len(&self) -> usize {
        self.len()
    }

    fn _get(&self, index: usize) -> &Self::Output {
        &self[index]
    }
}

impl<T: Clone> PySignedIndex for Vec<T> {
    type Output = T;

    fn _len(&self) -> usize {
        self.len()
    }

    fn _get(&self, index: usize) -> &Self::Output {
        &self[index]
    }
}

impl<T: Clone> PySignedIndex for im::Vector<T> {
    type Output = T;

    fn _len(&self) -> usize {
        self.len()
    }

    fn _get(&self, index: usize) -> &Self::Output {
        &self[index]
    }
}

#[macro_export]
macro_rules! impl_arc_list {
    ($name:ident, $py_name:literal, $storage:ty, $T:ty) => {
        #[pyclass(name = $py_name)]
        pub struct $name {
            storage: $storage,
        }

        #[pymethods]
        impl $name {
            fn __len__(&self) -> PyResult<usize> {
                Ok(self.storage.len())
            }

            fn __getitem__(&self, idx: isize) -> PyResult<$T> {
                use $crate::util::PySignedIndex;
                Ok(self.storage.signed_index(idx)?.into())
            }
        }

        impl From<$storage> for $name {
            fn from(storage: $storage) -> Self {
                $name { storage }
            }
        }
    };
}
