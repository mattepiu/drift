using System.ComponentModel;
using System.Windows.Input;

namespace WpfSample.ViewModels
{
    public class MainViewModel : INotifyPropertyChanged
    {
        private string _userName = "";
        private string _email = "";
        private string _statusMessage = "Ready";

        public event PropertyChangedEventHandler? PropertyChanged;

        public string UserName
        {
            get => _userName;
            set
            {
                _userName = value;
                OnPropertyChanged(nameof(UserName));
            }
        }

        public string Email
        {
            get => _email;
            set
            {
                _email = value;
                OnPropertyChanged(nameof(Email));
            }
        }

        public string StatusMessage
        {
            get => _statusMessage;
            set
            {
                _statusMessage = value;
                OnPropertyChanged(nameof(StatusMessage));
            }
        }

        public ICommand SaveCommand { get; }
        public ICommand ClearCommand { get; }

        public MainViewModel()
        {
            SaveCommand = new RelayCommand(Save, CanSave);
            ClearCommand = new RelayCommand(Clear);
        }

        private void Save()
        {
            StatusMessage = $"Saved user: {UserName}";
        }

        private bool CanSave()
        {
            return !string.IsNullOrWhiteSpace(UserName) && !string.IsNullOrWhiteSpace(Email);
        }

        private void Clear()
        {
            UserName = "";
            Email = "";
            StatusMessage = "Cleared";
        }

        protected virtual void OnPropertyChanged(string propertyName)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
    }

    public class RelayCommand : ICommand
    {
        private readonly Action _execute;
        private readonly Func<bool>? _canExecute;

        public event EventHandler? CanExecuteChanged;

        public RelayCommand(Action execute, Func<bool>? canExecute = null)
        {
            _execute = execute;
            _canExecute = canExecute;
        }

        public bool CanExecute(object? parameter) => _canExecute?.Invoke() ?? true;
        public void Execute(object? parameter) => _execute();
    }
}
